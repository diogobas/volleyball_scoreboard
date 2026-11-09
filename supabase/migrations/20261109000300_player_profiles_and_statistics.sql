begin;

create function private.valid_player_positions(p_positions text[]) returns boolean
language sql immutable set search_path='' as $$
  select p_positions is not null and coalesce(array_ndims(p_positions),1)=1
    and p_positions <@ array['S','MB','O','OH','LB']::text[]
    and array_position(p_positions,null) is null
    and cardinality(p_positions)=(select count(distinct code) from unnest(p_positions) code);
$$;
revoke all on function private.valid_player_positions(text[]) from public,anon,authenticated;
grant execute on function private.valid_player_positions(text[]) to authenticated;

alter table public.players add column sex text check(sex in ('female','male','other'));
alter table public.players add column preferred_positions text[] not null default '{}' check(private.valid_player_positions(preferred_positions));

create function public.save_group_player_profile(p_group_id uuid,p_player_id uuid,p_name text,p_category text,p_sex text,p_preferred_positions text[],p_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.players; saved public.players; clean_name text:=regexp_replace(btrim(p_name),'\s+',' ','g'); positions text[];
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage players.' using errcode='42501'; end if;
  if (p_sex is not null and p_sex not in ('female','male','other')) or not private.valid_player_positions(p_preferred_positions) then raise exception 'Choose a valid sex and preferred positions.' using errcode='22023'; end if;
  -- Store positions in the fixed display order, so reordering a selection is not a change.
  select coalesce(array_agg(code order by ord),'{}'::text[]) into positions
    from unnest(array['S','MB','O','OH','LB']::text[]) with ordinality as options(code,ord) where code=any(p_preferred_positions);
  select * into previous from public.players where id=p_player_id;
  if found then
    if previous.group_id<>p_group_id then raise exception 'This player belongs to another group.' using errcode='42501'; end if;
    if previous.deleted_at is not null then raise exception 'This player was deleted. Refresh the registry.' using errcode='P0002'; end if;
    if previous.name=clean_name and previous.category=p_category and previous.sex is not distinct from p_sex and previous.preferred_positions=positions then return to_jsonb(previous); end if;
    if p_expected_version is distinct from previous.version then raise exception 'This player changed. Refresh before editing again.' using errcode='40001'; end if;
  end if;
  -- Reuse the existing name/category validation and preserve the legacy save contract.
  perform public.save_group_player(p_group_id,p_player_id,p_name,p_category,p_expected_version);
  update public.players set sex=p_sex,preferred_positions=positions,
    version=case when previous.id is null then version else previous.version+1 end
    where id=p_player_id returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_group_player_profile(uuid,uuid,text,text,text,text[],integer) from public,anon,authenticated;
grant execute on function public.save_group_player_profile(uuid,uuid,text,text,text,text[],integer) to authenticated;

-- Copy profile attributes once when a person is added to another group. Subsequent
-- edits remain local to that membership and never modify another group's profile.
create function private.copy_community_player_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare source public.players;
begin
  if new.community_person_id is not null then
    select * into source from public.players where community_person_id=new.community_person_id and deleted_at is null and group_id<>new.group_id order by created_at,id limit 1;
    if found then
      new.sex:=coalesce(new.sex,source.sex);
      if new.preferred_positions='{}'::text[] then new.preferred_positions:=source.preferred_positions; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.copy_community_player_profile() from public,anon,authenticated;
-- Alphabetical trigger order: community identity is linked before profile attributes.
create trigger zz_copy_community_player_profile before insert on public.players for each row execute function private.copy_community_player_profile();

create function public.public_player_profile(p_group_id uuid,p_player_ref text,p_season integer default null,p_period text default 'all',p_page integer default 1,p_page_size integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare person public.players; g public.groups; summary jsonb; stats jsonb;
begin
  select * into g from public.groups where id=p_group_id;
  if not found then raise exception 'Group not found.' using errcode='P0002'; end if;
  select * into person from public.players p where p.group_id=g.id and (p.id::text=lower(p_player_ref) or p.display_id=upper(p_player_ref));
  if not found then raise exception 'Player not found in this group.' using errcode='P0002'; end if;
  if person.deleted_at is not null and not exists(
    select 1 from public.set_players sp join public.matches m on m.id=sp.match_id where sp.player_id=person.id and m.group_id=g.id and m.published
      and exists(select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number)
    union all select 1 from public.match_player_totals t join public.matches m on m.id=t.match_id where t.player_id=person.id and m.group_id=g.id and m.published
  ) then raise exception 'Player not found in this group.' using errcode='P0002'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not in (5,10,25) then raise exception 'Invalid player match page.' using errcode='22023'; end if;
  summary:=public.public_group_period_summary(g.id,p_season,1,p_period);
  select value into stats from jsonb_array_elements(summary->'players') where value->>'id'=person.id::text;
  stats:=coalesce(stats,jsonb_build_object('points',0,'matches',0,'wins',0,'days',0));
  return (with season_matches as (
    select m.*,coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date) as played_date,
      coalesce(m.started_at,m.closed_at) as played_at
    from public.matches m where m.group_id=g.id and m.published
      and extract(year from coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date))=(summary->>'season')::integer
      and public.in_season_period(coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date),p_period)
  ), participation_rows as (
    select sp.match_id,sp.team,case when m.decided_at is null or sp.set_number<=m.decided_at then sp.team end as result_team
      from public.set_players sp join season_matches m on m.id=sp.match_id where sp.player_id=person.id
      and exists(select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number)
    union all select t.match_id,t.team,t.result_team from public.match_player_totals t join season_matches m on m.id=t.match_id where t.player_id=person.id
  ), participation as (
    select match_id,jsonb_agg(distinct team order by team) as teams,count(distinct result_team) as result_teams,min(result_team) as sole_team
    from participation_rows group by match_id
  ), played_matches as (
    select m.*,p.teams,case when m.winner is null then 'unfinished' when p.result_teams>1 then 'mixed' when p.result_teams=0 then case when m.entry_mode='summary' then 'unassigned' else 'training' end when p.sole_team=m.winner then 'win' else 'loss' end as player_result,
      (select count(*) from public.match_points pt where pt.match_id=m.id and pt.player_id=person.id and not pt.is_opponent_error)+
      (select coalesce(sum(t.points),0) from public.match_player_totals t where t.match_id=m.id and t.player_id=person.id) as player_points
    from season_matches m join participation p on p.match_id=m.id
  ), page_matches as (
    select * from played_matches order by played_at desc,id desc limit p_page_size offset ((p_page-1)*p_page_size)
  ) select jsonb_build_object(
    'group',summary->'group','season',summary->'season','period',p_period,'seasons',summary->'seasons',
    'player',jsonb_build_object('id',person.id,'display_id',person.display_id,'name',person.name,'category',person.category,'sex',person.sex,'preferred_positions',person.preferred_positions,'removed',person.deleted_at is not null),
    'statistics',jsonb_build_object('points',stats->'points','matches',stats->'matches','wins',stats->'wins','days',stats->'days','attendance_day_count',summary->'attendance_day_count'),
    'page',p_page,'page_size',p_page_size,'match_count',(select count(*) from played_matches),
    'matches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'entry_mode',m.entry_mode,'player_totals_recorded',m.player_totals_recorded,'played_on',m.played_on,'started_at',m.started_at,'closed_at',m.closed_at,'played_date',m.played_date,
      'team_a_name',coalesce(m.snapshot->>'team_a_name','Team 1'),'team_b_name',coalesce(m.snapshot->>'team_b_name','Team 2'),
      'sets_a',m.sets_a,'sets_b',m.sets_b,'winner',m.winner,'decided_at',m.decided_at,
      'player_points',m.player_points,'player_teams',m.teams,'player_result',m.player_result,
      'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=m.id)
    ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)));
end;
$$;
revoke all on function public.public_player_profile(uuid,text,integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.public_player_profile(uuid,text,integer,text,integer,integer) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
