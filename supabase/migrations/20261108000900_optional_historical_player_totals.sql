begin;

-- Unknown individual points are distinct from recorded zero points.
alter table public.matches add column player_totals_recorded boolean not null default true;

create or replace function public.save_historical_match(p_group_id uuid,p_match jsonb,p_expected_version integer,p_reason text,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare g public.groups; m public.matches; d private.game_days; old private.match_revisions; person jsonb; canonical jsonb;
  players jsonb:='[]'; s jsonb; score_a integer:=0; score_b integer:=0; points_a integer; points_b integer;
  result jsonb; snapshot jsonb; id uuid:=(p_match->>'id')::uuid; dt date:=(p_match->>'played_on')::date;
  set_number integer:=0; counts_a integer:=0; counts_b integer:=0; training boolean; target integer; high integer; low integer;
  old_day uuid; seen uuid[]:=array[]::uuid[]; clean_reason text:=btrim(p_reason); timestamp_on timestamptz; record_totals boolean:=coalesce((p_match->>'player_totals_recorded')::boolean,true);
begin
  perform 1 from public.groups where public.groups.id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can register historical matches.' using errcode='42501'; end if;
  select * into strict g from public.groups where public.groups.id=p_group_id;
  perform private.require_match_keys(p_match-'player_totals_recorded',array['format_version','id','group_id','played_on','rules','team_a_name','team_b_name','sets','players','errors_a','errors_b']);
  if p_match->'format_version' is distinct from '3'::jsonb or (p_match->>'group_id')::uuid is distinct from g.id or id is null or dt is null or not isfinite(dt)
    or p_match->>'rules' is null or p_match->>'rules' not in ('official','recreational') or p_revision_id is null or clean_reason is null or char_length(clean_reason) not between 1 and 500
    or jsonb_typeof(p_match->'team_a_name') is distinct from 'string' or jsonb_typeof(p_match->'team_b_name') is distinct from 'string' or char_length(btrim(p_match->>'team_a_name')) not between 1 and 16 or char_length(btrim(p_match->>'team_b_name')) not between 1 and 16 then raise exception 'Invalid historical match details.'; end if;
  select * into m from public.matches where public.matches.id=id for update;
  if found and (m.group_id<>g.id or m.entry_mode<>'summary' or not m.published) then raise exception 'This match cannot be replaced by a historical summary.'; end if;
  select * into old from private.match_revisions where private.match_revisions.id=p_revision_id;
  if found then
    if old.match_id<>id or old.group_id<>g.id or old.author_id<>auth.uid() or old.reason<>clean_reason or old.new_snapshot->'source' is distinct from p_match then raise exception 'Revision ID belongs to another change.'; end if;
    return jsonb_build_object('id',id,'version',old.version);
  end if;
  if m.id is not null and p_expected_version is distinct from m.version then raise exception 'Match changed. Refresh before editing.' using errcode='40001'; end if;
  if m.id is null and p_expected_version is not null then raise exception 'Historical match not found.'; end if;
  if octet_length(p_match::text)>4000000 or jsonb_array_length(p_match->'players')>200 or jsonb_typeof(p_match->'sets') is distinct from 'array' or jsonb_array_length(p_match->'sets') not between 1 and 100 or jsonb_typeof(p_match->'players') is distinct from 'array' then raise exception 'Provide sets and players.'; end if;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    perform private.require_match_keys(s,array['score_a','score_b','early_finish']);
    if jsonb_typeof(s->'score_a') is distinct from 'number' or jsonb_typeof(s->'score_b') is distinct from 'number' or (s->>'score_a') !~ '^[0-9]+$' or (s->>'score_b') !~ '^[0-9]+$' or jsonb_typeof(s->'early_finish') is distinct from 'boolean' then raise exception 'Invalid set score.'; end if;
    high:=greatest((s->>'score_a')::int,(s->>'score_b')::int); low:=least((s->>'score_a')::int,(s->>'score_b')::int);
    if high=low then raise exception 'A completed set cannot be tied.'; end if;
    set_number:=set_number+1; training:=counts_a=3 or counts_b=3;
    target:=case when p_match->>'rules'='official' and set_number=5 then 15 else 25 end;
    if not training and not ((high=target and low<=target-2) or (high>target and high=low+2))
      and (p_match->>'rules'='official' or not (s->>'early_finish')::boolean) then raise exception 'Set % needs a valid winning score or an explicit recreational early finish.',set_number; end if;
    if not training then
      if (s->>'score_a')::int>(s->>'score_b')::int then counts_a:=counts_a+1; else counts_b:=counts_b+1; end if;
    end if;
    score_a:=score_a+(s->>'score_a')::int; score_b:=score_b+(s->>'score_b')::int;
  end loop;
  if p_match ? 'player_totals_recorded' and jsonb_typeof(p_match->'player_totals_recorded') is distinct from 'boolean' then raise exception 'Invalid player totals option.'; end if;
  if record_totals then
    for person in select value from jsonb_array_elements(p_match->'players') loop
      perform private.require_match_keys(person,array['team','player_id','name','points']);
      if person->>'team' not in ('A','B') or person->>'team' is null or person->>'points' is null or (person->>'points') !~ '^[0-9]+$' then raise exception 'Invalid player totals.'; end if;
      canonical:=private.match_player(g.id,person->>'player_id',person->>'name',null);
      if (canonical->>'id')::uuid=any(seen) then raise exception 'Use a different player in every row.'; end if;
      seen:=array_append(seen,(canonical->>'id')::uuid);
      players:=players||jsonb_build_array(person||jsonb_build_object('player_id',canonical->'id'));
    end loop;
    if (select count(*) from jsonb_array_elements(players) p where p->>'team'='A')<6 or (select count(*) from jsonb_array_elements(players) p where p->>'team'='B')<6 then raise exception 'Include at least six players per team.'; end if;
    if p_match->>'errors_a' is null or p_match->>'errors_b' is null or (p_match->>'errors_a') !~ '^[0-9]+$' or (p_match->>'errors_b') !~ '^[0-9]+$' then raise exception 'Enter nonnegative opponent errors.'; end if;
    select coalesce(sum((p->>'points')::int) filter(where p->>'team'='A'),0)+(p_match->>'errors_a')::int,
      coalesce(sum((p->>'points')::int) filter(where p->>'team'='B'),0)+(p_match->>'errors_b')::int into points_a,points_b from jsonb_array_elements(players) p;
    if points_a<>score_a or points_b<>score_b then raise exception 'Player points plus opponent errors must equal the set score totals (% and %).',score_a,score_b; end if;
  elsif p_match->'players' is distinct from '[]'::jsonb or p_match->'errors_a' is distinct from 'null'::jsonb or p_match->'errors_b' is distinct from 'null'::jsonb then
    raise exception 'Score-only matches must omit player totals and opponent errors.';
  end if;
  result:=private.match_result(p_match->'sets');
  snapshot:=p_match||jsonb_build_object('players',players,'source',p_match);
  timestamp_on:=(dt+time '12:00') at time zone g.time_zone;
  insert into private.game_days(group_id,play_date,state) values(g.id,dt,'closed') on conflict(group_id,play_date) do nothing;
  select * into strict d from private.game_days where group_id=g.id and play_date=dt for update;
  if m.id is not null then select day_id into old_day from private.day_receipts where private.day_receipts.id=id; end if;
  if m.id is null then
    insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,entry_mode,played_on,rules,winner,decided_at)
      values(id,g.id,timestamp_on,(result->>'sets_a')::int,(result->>'sets_b')::int,snapshot,'summary',dt,p_match->>'rules',result->>'winner',(result->>'decided_at')::int);
    insert into private.match_metadata(match_id,submitted_by,submission) values(id,auth.uid(),p_match);
    insert into private.day_receipts(id,day_id,submission,draft,decision,submitted_by) values(id,d.id,p_match,snapshot,'approved',auth.uid());
    -- Creation uses the same revision token as retries without inventing a second match.
    insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot) values(p_revision_id,id,g.id,auth.uid(),2,clean_reason,'{}',snapshot);
    update public.matches set version=2 where public.matches.id=id;
  else
    delete from public.match_sets where match_id=id;
    delete from public.match_player_totals where match_id=id;
    insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot) values(p_revision_id,id,g.id,auth.uid(),m.version+1,clean_reason,m.snapshot,snapshot);
    update public.matches set closed_at=timestamp_on,played_on=dt,rules=p_match->>'rules',snapshot=snapshot,version=m.version+1,sets_a=(result->>'sets_a')::int,sets_b=(result->>'sets_b')::int,winner=result->>'winner',decided_at=(result->>'decided_at')::int where public.matches.id=id;
    update private.day_receipts set day_id=d.id,draft=snapshot,version=m.version+1 where private.day_receipts.id=id;
  end if;
  update public.matches set player_totals_recorded=record_totals where public.matches.id=id;
  set_number:=0;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    set_number:=set_number+1; insert into public.match_sets values(id,g.id,set_number,(s->>'score_a')::int,(s->>'score_b')::int);
  end loop;
  insert into public.match_player_totals(match_id,group_id,team,player_id,player_name,points)
    select id,g.id,p->>'team',(p->>'player_id')::uuid,p->>'name',(p->>'points')::int from jsonb_array_elements(players) p;
  update private.game_days set version=version+1 where private.game_days.id=d.id;
  if old_day is not null and old_day<>d.id then update private.game_days set version=version+1 where private.game_days.id=old_day; end if;
  return jsonb_build_object('id',id,'version',coalesce(m.version,1)+1);
end;
$$;

create or replace function public.get_historical_match(p_group_id uuid,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.matches;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can edit historical matches.' using errcode='42501'; end if;
  select * into strict m from public.matches where id=p_match_id and group_id=p_group_id and entry_mode='summary' and published;
  return jsonb_build_object('version',m.version,'payload',(m.snapshot-'source')||jsonb_build_object('player_totals_recorded',m.player_totals_recorded),'players',(select coalesce(jsonb_agg(to_jsonb(p) order by name),'[]'::jsonb) from public.players p where group_id=p_group_id and deleted_at is null));
end;
$$;
revoke all on function public.save_historical_match(uuid,jsonb,integer,text,uuid),public.get_historical_match(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_historical_match(uuid,jsonb,integer,text,uuid),public.get_historical_match(uuid,uuid) to authenticated;

create or replace function public.public_group_summary(p_group_id uuid, p_season integer default null, p_page integer default 1)
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
    ), participation_rows as (
      select sp.player_id,sp.match_id,sp.team from public.set_players sp join season_matches m on m.id=sp.match_id
      where exists(select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number)
      union select t.player_id,t.match_id,t.team from public.match_player_totals t join season_matches m on m.id=t.match_id
    ), participation as (
      select player_id,match_id,count(distinct team) as teams,min(team) as sole_team from participation_rows group by player_id,match_id
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
      'season',v_season,'page',p_page,'page_size',25,
      'seasons',(select jsonb_agg(year order by year desc) from (
        select distinct extract(year from played_date)::integer as year from all_matches
        union select extract(year from current_timestamp at time zone v_group.time_zone)::integer
        union select v_season
      ) years),
      'match_count',(select count(*) from season_matches),
      'point_count',(select coalesce(sum(s.score_a+s.score_b),0) from public.match_sets s join season_matches m on m.id=s.match_id),
      'unattributed_matches',(select count(*) from season_matches where not player_totals_recorded),
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

create or replace function public.public_match_details(p_group_id uuid, p_match_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id;
  if not found then raise exception 'Match not found in this group.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group',(select jsonb_build_object('id',g.id,'display_id',g.display_id,'name',g.name,'time_zone',g.time_zone) from public.groups g where g.id=p_group_id),
    'id',v_match.id,'player_totals_recorded',v_match.player_totals_recorded,'entry_mode',v_match.entry_mode,'rules',v_match.rules,'winner',v_match.winner,'decided_at',v_match.decided_at,'played_on',v_match.played_on,'group_id',v_match.group_id,'started_at',v_match.started_at,'closed_at',v_match.closed_at,'version',v_match.version,
    'team_a_name',coalesce(v_match.snapshot->>'team_a_name','Team 1'),
    'team_b_name',coalesce(v_match.snapshot->>'team_b_name','Team 2'),
    'sets_a',v_match.sets_a,
    'sets_b',v_match.sets_b,
    'players',case when v_match.entry_mode='summary' then (select coalesce(jsonb_agg(jsonb_build_object('id',player_id,'name',player_name,'team',team,'points',points) order by team,player_name),'[]'::jsonb) from public.match_player_totals where match_id=v_match.id) else null end,
    'errors_a',v_match.snapshot->'errors_a','errors_b',v_match.snapshot->'errors_b',
    'sets',(select coalesce(jsonb_agg(jsonb_build_object(
      'statistics_available',v_match.entry_mode='events','training',v_match.decided_at is not null and s.set_number>v_match.decided_at,'early_finish',coalesce(v_match.snapshot->'sets'->(s.set_number-1)->'early_finish','false'::jsonb),'number',s.set_number,'score_a',s.score_a,'score_b',s.score_b,
      'team_a_name',coalesce(v_match.snapshot->'sets'->(s.set_number-1)->>'team_a_name',v_match.snapshot->>'team_a_name','Team 1'),
      'team_b_name',coalesce(v_match.snapshot->'sets'->(s.set_number-1)->>'team_b_name',v_match.snapshot->>'team_b_name','Team 2'),
      'players',(select coalesce(jsonb_agg(jsonb_build_object('id',sp.player_id,'name',sp.player_name,'team',sp.team,'position',sp.position,
        'points',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.player_id=sp.player_id and pt.team=sp.team)
      ) order by sp.team,sp.position),'[]'::jsonb) from public.set_players sp where sp.match_id=s.match_id and sp.set_number=s.set_number),
      'errors_a',case when v_match.entry_mode='events' then (select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='A' and pt.is_opponent_error) else null end,
      'errors_b',case when v_match.entry_mode='events' then (select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='B' and pt.is_opponent_error) else null end
    ) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=v_match.id)
  );
end;
$$;

create or replace function public.list_group_matches(p_group_id uuid,p_season integer default null,p_day_id uuid default null,p_query text default '',p_page integer default 1,p_page_size integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.groups;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage matches.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not in (5,10,25) or char_length(coalesce(p_query,''))>120
    or (p_season is not null and p_season not between 1 and 9999) then raise exception 'Invalid search or match page.'; end if;
  select * into strict g from public.groups where id=p_group_id;
  if p_day_id is not null and not exists(select 1 from private.game_days where id=p_day_id and group_id=g.id) then raise exception 'Game day not found in this group.'; end if;
  return (with all_matches as (
    select m.*,d.id as day_id,d.play_date as day_date,coalesce(m.started_at,m.closed_at) as played_at,
      coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date) as played_date
    from public.matches m left join private.day_receipts r on r.id=m.id left join private.game_days d on d.id=r.day_id
    where m.group_id=g.id and m.published
  ), filtered as (
    select m.* from all_matches m where (p_day_id is null or m.day_id=p_day_id) and (p_season is null or extract(year from m.played_date)=p_season)
      and (coalesce(btrim(p_query),'')='' or position(private.normalize_player_name(p_query) in private.normalize_player_name(concat_ws(' ',m.played_date::text,m.day_date::text,m.snapshot->>'team_a_name',m.snapshot->>'team_b_name')))>0
        or exists(select 1 from public.set_players sp where sp.match_id=m.id and position(private.normalize_player_name(p_query) in private.normalize_player_name(sp.player_name))>0) or exists(select 1 from public.match_player_totals t where t.match_id=m.id and position(private.normalize_player_name(p_query) in private.normalize_player_name(t.player_name))>0))
  ), totals as (
    select count(*) as total,greatest(1,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::int))) as page from filtered
  ), page_matches as (
    select * from filtered order by played_at desc,id desc limit p_page_size offset (select (page-1)*p_page_size from totals)
  ) select jsonb_build_object('group',to_jsonb(g),'page',(select page from totals),'page_size',p_page_size,'total',(select total from totals),
    'seasons',(select coalesce(jsonb_agg(year order by year desc),'[]'::jsonb) from (select distinct extract(year from played_date)::int as year from all_matches union select extract(year from now() at time zone g.time_zone)::int) years),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'player_totals_recorded',m.player_totals_recorded,'entry_mode',m.entry_mode,'rules',m.rules,'winner',m.winner,'decided_at',m.decided_at,'played_on',m.played_on,'version',m.version,'started_at',m.started_at,'closed_at',m.closed_at,'day_id',m.day_id,'day_date',m.day_date,
      'team_a_name',m.snapshot->>'team_a_name','team_b_name',m.snapshot->>'team_b_name','sets_a',m.sets_a,'sets_b',m.sets_b,
      'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=m.id)
    ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)));
end;
$$;
commit;
