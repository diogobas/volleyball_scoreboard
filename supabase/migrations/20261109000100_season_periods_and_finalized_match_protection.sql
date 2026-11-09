begin;

-- Keep the historical date conversion internal; no user timezone configuration is needed.
-- Periods are calendar-month buckets within the selected calendar year.
create function public.in_season_period(p_date date,p_period text) returns boolean
language sql immutable set search_path='' as $$
  select case p_period
    when 'all' then true
    when 'winter' then extract(month from p_date) in (12,1,2)
    when 'spring' then extract(month from p_date) between 3 and 5
    when 'summer' then extract(month from p_date) between 6 and 8
    when 'fall' then extract(month from p_date) between 9 and 11
    else false end;
$$;
revoke all on function public.in_season_period(date,text) from public;
grant execute on function public.in_season_period(date,text) to anon,authenticated;

-- Older clients may still call the deletion RPC. Reject rather than unpublish.
create or replace function public.delete_final_match(p_group_id uuid,p_match_id uuid,p_expected_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can delete matches.' using errcode='42501'; end if;
  if not exists(select 1 from public.matches where id=p_match_id and group_id=p_group_id) then raise exception 'Match not found in this group.' using errcode='P0002'; end if;
  raise exception 'Finalized matches cannot be deleted.' using errcode='23514';
end;
$$;

create or replace function public.delete_game_day(p_group_id uuid,p_day_id uuid,p_expected_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare d private.game_days;
begin
  -- Same group/day lock order as uploads, reviews and publication.
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can delete game days.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Provide a reason with 1–500 characters.' using errcode='22023'; end if;
  select * into d from private.game_days where id=p_day_id for update;
  if not found then return; end if; -- A retry after a lost confirmation is harmless.
  if d.group_id<>p_group_id then raise exception 'Game day belongs to another group.' using errcode='42501'; end if;
  if p_expected_version is distinct from d.version then raise exception 'Day changed. Refresh before deleting.' using errcode='40001'; end if;
  if exists(select 1 from public.matches m join private.day_receipts r on r.id=m.id where r.day_id=d.id and m.published) then
    raise exception 'Days with finalized matches cannot be deleted.' using errcode='23514';
  end if;
  insert into private.day_deletions(day_id,group_id,author_id,reason,previous_state)
    values(d.id,d.group_id,auth.uid(),btrim(p_reason),to_jsonb(d)-'code_hash');
  -- Delete relational children explicitly before removing results and their audit metadata.
  delete from public.match_points where group_id=d.group_id and match_id in(select id from private.day_receipts where day_id=d.id);
  delete from public.set_players where group_id=d.group_id and match_id in(select id from private.day_receipts where day_id=d.id);
  delete from public.matches where group_id=d.group_id and id in(select id from private.day_receipts where day_id=d.id);
  delete from private.day_receipts where day_id=d.id;
  delete from private.day_lineups where day_id=d.id;
  delete from private.day_audit where day_id=d.id;
  delete from private.game_days where id=d.id;
end;
$$;

-- Separate RPC names preserve older clients and maintenance scripts.
create or replace function public.public_group_period_summary(p_group_id uuid, p_season integer default null, p_page integer default 1, p_period text default 'all')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_group public.groups;
  v_season integer;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
  v_season := coalesce(p_season, extract(year from current_timestamp at time zone v_group.time_zone)::integer);
  if v_season not between 1 and 9999 or p_page is null or p_page not between 1 and 100000 then
    raise exception 'Invalid season or page.' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('all','winter','spring','summer','fall') then raise exception 'Invalid season period.' using errcode='22023'; end if;
  return (
    with all_matches as (
      select m.*, coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone v_group.time_zone)::date) as played_date,
        coalesce(m.started_at,m.closed_at) as played_at,
        m.sets_a as won_a,
        m.sets_b as won_b
      from public.matches m where m.group_id=p_group_id
    ), season_matches as (
      select *
      from all_matches where extract(year from played_date)=v_season
        and public.in_season_period(played_date,p_period)
    ), participation_rows as (
      select sp.player_id,sp.match_id,sp.team,case when m.decided_at is null or sp.set_number<=m.decided_at then sp.team end as result_team from public.set_players sp join season_matches m on m.id=sp.match_id
      where exists(select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number)
      union select t.player_id,t.match_id,t.team,t.result_team from public.match_player_totals t join season_matches m on m.id=t.match_id
    ), participation as (
      select player_id,match_id,count(distinct result_team) as teams,min(result_team) as sole_team from participation_rows group by player_id,match_id
    ), attendance as (
      select p.player_id,count(*) as matches,count(distinct m.played_date) as days,
        count(*) filter(where p.teams=1 and p.sole_team=m.winner) as wins
      from participation p join season_matches m on m.id=p.match_id group by p.player_id
    ), point_rows as (
      select pt.player_id,count(*) as points from public.match_points pt join season_matches m on m.id=pt.match_id where not pt.is_opponent_error group by pt.player_id
      union all select t.player_id,sum(t.points) from public.match_player_totals t join season_matches m on m.id=t.match_id group by t.player_id
    ), points as (
      select player_id,sum(points) as points from point_rows group by player_id
    ), player_totals as (
      select p.id,p.name,p.display_id,p.category,(p.deleted_at is not null) as removed,coalesce(pt.points,0) as points,coalesce(a.matches,0) as matches,
        coalesce(a.wins,0) as wins,coalesce(a.days,0) as days
      from public.players p left join attendance a on a.player_id=p.id left join points pt on pt.player_id=p.id
      where p.group_id=p_group_id and (p.deleted_at is null or coalesce(a.matches,0)>0)
    ), page_matches as (
      select * from season_matches order by played_at desc,id desc limit 25 offset ((p_page-1)*25)
    )
    select jsonb_build_object(
      'group',jsonb_build_object('id',v_group.id,'display_id',v_group.display_id,'name',v_group.name,'time_zone',v_group.time_zone),
      'season',v_season,'period',p_period,'page',p_page,'page_size',25,
      'seasons',(select jsonb_agg(year order by year desc) from (
        select distinct extract(year from played_date)::integer as year from all_matches
        union select extract(year from current_timestamp at time zone v_group.time_zone)::integer
        union select v_season
      ) years),
      'match_count',(select count(*) from season_matches),
      'point_count',(select coalesce(sum(s.score_a+s.score_b),0) from public.match_sets s join season_matches m on m.id=s.match_id),
      'unattributed_matches',(select count(*) from season_matches where not player_totals_recorded),
      'attendance_day_count',(select count(distinct m.played_date) from season_matches m where exists(select 1 from participation p where p.match_id=m.id)),
      'participant_count',(select count(*) from player_totals where matches>0),
      'fallback_dates',(select count(*) from season_matches where started_at is null and entry_mode='events'),
      'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.points desc,p.wins desc,p.name,p.id) from player_totals p),'[]'::jsonb),
      'matches',coalesce((select jsonb_agg(jsonb_build_object(
        'id',m.id,'player_totals_recorded',m.player_totals_recorded,'entry_mode',m.entry_mode,'rules',m.rules,'winner',m.winner,'decided_at',m.decided_at,'played_on',m.played_on,'started_at',m.started_at,'closed_at',m.closed_at,'played_date',m.played_date,'version',m.version,
        'team_a_name',coalesce(m.snapshot->>'team_a_name','Team 1'),
        'team_b_name',coalesce(m.snapshot->>'team_b_name','Team 2'),
        'sets_a',m.won_a,'sets_b',m.won_b,
        'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb)
          from public.match_sets s where s.match_id=m.id)
      ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.list_group_period_matches(p_group_id uuid,p_season integer default null,p_day_id uuid default null,p_query text default '',p_page integer default 1,p_page_size integer default 5,p_period text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.groups;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage matches.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not in (5,10,25) or char_length(coalesce(p_query,''))>120
    or (p_season is not null and p_season not between 1 and 9999) then raise exception 'Invalid search or match page.'; end if;
  if p_period is null or p_period not in ('all','winter','spring','summer','fall') then raise exception 'Invalid season period.' using errcode='22023'; end if;
  select * into strict g from public.groups where id=p_group_id;
  if p_day_id is not null and not exists(select 1 from private.game_days where id=p_day_id and group_id=g.id) then raise exception 'Game day not found in this group.'; end if;
  return (with all_matches as (
    select m.*,d.id as day_id,d.play_date as day_date,coalesce(m.started_at,m.closed_at) as played_at,
      coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date) as played_date
    from public.matches m left join private.day_receipts r on r.id=m.id left join private.game_days d on d.id=r.day_id
    where m.group_id=g.id and m.published
  ), filtered as (
    select m.* from all_matches m where (p_day_id is null or m.day_id=p_day_id) and (p_season is null or extract(year from m.played_date)=p_season)
      and public.in_season_period(m.played_date,p_period)
      and (coalesce(btrim(p_query),'')='' or position(private.normalize_player_name(p_query) in private.normalize_player_name(concat_ws(' ',m.played_date::text,m.day_date::text,m.snapshot->>'team_a_name',m.snapshot->>'team_b_name')))>0
        or exists(select 1 from public.set_players sp where sp.match_id=m.id and position(private.normalize_player_name(p_query) in private.normalize_player_name(sp.player_name))>0) or exists(select 1 from public.match_player_totals t where t.match_id=m.id and position(private.normalize_player_name(p_query) in private.normalize_player_name(t.player_name))>0))
  ), totals as (
    select count(*) as total,greatest(1,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::int))) as page from filtered
  ), page_matches as (
    select * from filtered order by played_at desc,id desc limit p_page_size offset (select (page-1)*p_page_size from totals)
  ) select jsonb_build_object('group',to_jsonb(g),'period',p_period,'page',(select page from totals),'page_size',p_page_size,'total',(select total from totals),
    'seasons',(select coalesce(jsonb_agg(year order by year desc),'[]'::jsonb) from (select distinct extract(year from played_date)::int as year from all_matches union select extract(year from now() at time zone g.time_zone)::int) years),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'entry_mode',m.entry_mode,'player_totals_recorded',m.player_totals_recorded,'rules',m.rules,'winner',m.winner,'decided_at',m.decided_at,'played_on',m.played_on,'version',m.version,'started_at',m.started_at,'closed_at',m.closed_at,'day_id',m.day_id,'day_date',m.day_date,
      'team_a_name',m.snapshot->>'team_a_name','team_b_name',m.snapshot->>'team_b_name','sets_a',m.sets_a,'sets_b',m.sets_b,
      'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=m.id)
    ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)));
end;
$$;

revoke all on function public.public_group_period_summary(uuid,integer,integer,text),public.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.public_group_period_summary(uuid,integer,integer,text) to anon,authenticated;
grant execute on function public.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
