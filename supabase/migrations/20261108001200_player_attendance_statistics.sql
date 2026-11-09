begin;
-- Count the entire season, not the currently displayed page. Unknown rosters do not imply absence.
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
      'season',v_season,'page',p_page,'page_size',25,
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

notify pgrst, 'reload schema';
commit;
