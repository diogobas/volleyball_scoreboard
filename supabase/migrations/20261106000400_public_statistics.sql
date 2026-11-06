begin;

-- Public, read-only RPCs run as the caller and remain subject to public-read RLS.
create function public.public_group_summary(p_group_id uuid, p_season integer default null, p_page integer default 1)
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
      select m.*, (coalesce(m.started_at,m.closed_at) at time zone v_group.time_zone)::date as played_date,
        coalesce(m.started_at,m.closed_at) as played_at,
        (select count(*) from public.match_sets s where s.match_id=m.id and s.score_a>s.score_b) as won_a,
        (select count(*) from public.match_sets s where s.match_id=m.id and s.score_b>s.score_a) as won_b
      from public.matches m where m.group_id=p_group_id
    ), season_matches as (
      select *, case when won_a>won_b then 'A' when won_b>won_a then 'B' else null end as winner
      from all_matches where extract(year from played_date)=v_season
    ), participation as (
      select sp.player_id,sp.match_id,count(distinct sp.team) as teams,min(sp.team) as sole_team
      from public.set_players sp join season_matches m on m.id=sp.match_id
      where sp.group_id=p_group_id and exists (
        select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number
      ) group by sp.player_id,sp.match_id
    ), attendance as (
      select p.player_id,count(*) as matches,count(distinct m.played_date) as days,
        count(*) filter(where p.teams=1 and p.sole_team=m.winner) as wins
      from participation p join season_matches m on m.id=p.match_id group by p.player_id
    ), points as (
      select pt.player_id,count(*) as points from public.match_points pt
      join season_matches m on m.id=pt.match_id where not pt.is_opponent_error group by pt.player_id
    ), player_totals as (
      select p.id,p.name,coalesce(pt.points,0) as points,coalesce(a.matches,0) as matches,
        coalesce(a.wins,0) as wins,coalesce(a.days,0) as days
      from public.players p left join attendance a on a.player_id=p.id left join points pt on pt.player_id=p.id
      where p.group_id=p_group_id
    ), page_matches as (
      select * from season_matches order by played_at desc,id desc limit 25 offset ((p_page-1)*25)
    )
    select jsonb_build_object(
      'group',jsonb_build_object('id',v_group.id,'name',v_group.name,'time_zone',v_group.time_zone),
      'season',v_season,'page',p_page,'page_size',25,
      'seasons',(select jsonb_agg(year order by year desc) from (
        select distinct extract(year from played_date)::integer as year from all_matches
        union select extract(year from current_timestamp at time zone v_group.time_zone)::integer
        union select v_season
      ) years),
      'match_count',(select count(*) from season_matches),
      'point_count',(select count(*) from public.match_points pt join season_matches m on m.id=pt.match_id),
      'participant_count',(select count(*) from player_totals where matches>0),
      'fallback_dates',(select count(*) from season_matches where started_at is null),
      'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.points desc,p.wins desc,p.name,p.id) from player_totals p),'[]'::jsonb),
      'matches',coalesce((select jsonb_agg(jsonb_build_object(
        'id',m.id,'started_at',m.started_at,'closed_at',m.closed_at,'played_date',m.played_date,'version',m.version,
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

create function public.public_match_details(p_group_id uuid, p_match_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id;
  if not found then raise exception 'Match not found in this group.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group',(select jsonb_build_object('id',g.id,'name',g.name,'time_zone',g.time_zone) from public.groups g where g.id=p_group_id),
    'id',v_match.id,'group_id',v_match.group_id,'started_at',v_match.started_at,'closed_at',v_match.closed_at,'version',v_match.version,
    'team_a_name',coalesce(v_match.snapshot->>'team_a_name','Team 1'),
    'team_b_name',coalesce(v_match.snapshot->>'team_b_name','Team 2'),
    'sets_a',(select count(*) from public.match_sets s where s.match_id=v_match.id and s.score_a>s.score_b),
    'sets_b',(select count(*) from public.match_sets s where s.match_id=v_match.id and s.score_b>s.score_a),
    'sets',(select coalesce(jsonb_agg(jsonb_build_object(
      'number',s.set_number,'score_a',s.score_a,'score_b',s.score_b,
      'team_a_name',coalesce(v_match.snapshot->'sets'->(s.set_number-1)->>'team_a_name',v_match.snapshot->>'team_a_name','Team 1'),
      'team_b_name',coalesce(v_match.snapshot->'sets'->(s.set_number-1)->>'team_b_name',v_match.snapshot->>'team_b_name','Team 2'),
      'players',(select coalesce(jsonb_agg(jsonb_build_object('id',sp.player_id,'name',sp.player_name,'team',sp.team,'position',sp.position,
        'points',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.player_id=sp.player_id)
      ) order by sp.team,sp.position),'[]'::jsonb) from public.set_players sp where sp.match_id=s.match_id and sp.set_number=s.set_number),
      'errors_a',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='A' and pt.is_opponent_error),
      'errors_b',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='B' and pt.is_opponent_error)
    ) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=v_match.id)
  );
end;
$$;

revoke all on function public.public_group_summary(uuid,integer,integer), public.public_match_details(uuid,uuid) from public,anon,authenticated;
grant execute on function public.public_group_summary(uuid,integer,integer), public.public_match_details(uuid,uuid) to anon,authenticated;

commit;
