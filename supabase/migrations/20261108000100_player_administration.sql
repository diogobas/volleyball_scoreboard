begin;

alter table public.players add column category text not null default 'sub' check (category in ('fixed','sub'));
alter table public.players add column deleted_at timestamptz;
alter table public.players add column version integer not null default 1 check (version > 0);
-- Deleted identities remain as tombstones: old devices cannot recreate them by UUID.
alter table public.players drop constraint players_group_id_normalized_name_key;
create unique index players_active_name_key on public.players(group_id,normalized_name) where deleted_at is null;

create or replace function public.get_group_registry(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_group public.groups;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can synchronize players.' using errcode = '42501';
  end if;
  select * into v_group from public.groups where id=p_group_id;
  return jsonb_build_object('group',to_jsonb(v_group),'players',
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.name,p.id),'[]'::jsonb) from public.players p where p.group_id=p_group_id and deleted_at is null),
    'deleted_player_ids',(select coalesce(jsonb_agg(id),'[]'::jsonb) from public.players where group_id=p_group_id and deleted_at is not null));
end;
$$;

create or replace function public.sync_group_player(p_group_id uuid,p_player_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(p_name),'\s+',' ','g');
  v_normalized text;
  v_player public.players;
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can synchronize players.' using errcode = '42501';
  end if;
  if p_player_id is null or v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'Provide a player ID and a name with 1–60 characters.' using errcode = '22023';
  end if;
  v_normalized := private.normalize_player_name(v_name);
  select * into v_player from public.players where id=p_player_id;
  if found then
    if v_player.group_id<>p_group_id then raise exception 'This player ID belongs to another group.' using errcode='23505'; end if;
    if v_player.deleted_at is not null then raise exception 'This player was deleted by an administrator. Refresh the registry.' using errcode='P0002'; end if;
    return jsonb_build_object('status',case when v_player.normalized_name=v_normalized then 'saved' else 'identity_conflict' end,'player',to_jsonb(v_player));
  end if;
  select * into v_player from public.players where group_id=p_group_id and deleted_at is null and
    (normalized_name=v_normalized or (position(' ' in v_normalized)=0 and split_part(normalized_name,' ',1)=v_normalized)) order by id limit 1;
  if found then return jsonb_build_object('status','name_conflict','player',to_jsonb(v_player)); end if;
  insert into public.players(id,group_id,name) values(p_player_id,p_group_id,v_name) returning * into v_player;
  return jsonb_build_object('status','saved','player',to_jsonb(v_player));
end;
$$;

create function public.save_group_player(p_group_id uuid,p_player_id uuid,p_name text,p_category text,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_player public.players; v_name text := regexp_replace(btrim(p_name),'\s+',' ','g');
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage players.' using errcode='42501'; end if;
  if p_player_id is null or v_name is null or char_length(v_name) not between 1 and 60 or p_category is null or p_category not in ('fixed','sub') then
    raise exception 'Provide a name with 1–60 characters and a valid category.' using errcode='22023';
  end if;
  select * into v_player from public.players where id=p_player_id;
  if found then
    if v_player.group_id<>p_group_id then raise exception 'This player belongs to another group.' using errcode='42501'; end if;
    if v_player.deleted_at is not null then raise exception 'This player was deleted. Refresh the registry.' using errcode='P0002'; end if;
    -- A retry after a lost response confirms the same save without overwriting a newer version.
    if v_player.name=v_name and v_player.category=p_category then return to_jsonb(v_player); end if;
    if p_expected_version is null or p_expected_version<>v_player.version then raise exception 'This player changed. Refresh before editing again.' using errcode='40001'; end if;
    update public.players set name=v_name,category=p_category,version=version+1 where id=p_player_id returning * into v_player;
  else
    if p_expected_version is not null then raise exception 'Player not found. Refresh the registry.' using errcode='P0002'; end if;
    insert into public.players(id,group_id,name,category) values(p_player_id,p_group_id,v_name,p_category) returning * into v_player;
  end if;
  return to_jsonb(v_player);
exception when unique_violation then
  raise exception 'A player with this name already exists in this group.' using errcode='23505';
end;
$$;

create function public.delete_group_player(p_group_id uuid,p_player_id uuid,p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_player public.players;
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage players.' using errcode='42501'; end if;
  select * into v_player from public.players where id=p_player_id and group_id=p_group_id;
  if not found then raise exception 'Player not found in this group.' using errcode='P0002'; end if;
  if v_player.deleted_at is not null then return; end if;
  if p_expected_version is null or p_expected_version<>v_player.version then raise exception 'This player changed. Refresh before deleting.' using errcode='40001'; end if;
  update public.players set deleted_at=now(),version=version+1 where id=p_player_id;
end;
$$;

revoke all on function public.save_group_player(uuid,uuid,text,text,integer),public.delete_group_player(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_group_player(uuid,uuid,text,text,integer),public.delete_group_player(uuid,uuid,integer) to authenticated;

-- Keep active lineup validation strict while preserving historical snapshots.
create or replace function private.check_day_lineup(p_group uuid,p_lineup jsonb) returns void
language plpgsql set search_path='' as $$
declare t text; person jsonb; seen uuid[] := '{}'; person_id uuid;
begin
  perform private.require_match_keys(p_lineup,array['A','B']);
  foreach t in array array['A','B'] loop
    perform private.require_match_keys(p_lineup->t,array['name','players']);
    if jsonb_typeof(p_lineup->t->'name') is distinct from 'string' or char_length(btrim(p_lineup->t->>'name')) not between 1 and 16
      or jsonb_typeof(p_lineup->t->'players') is distinct from 'array' then raise exception 'Invalid team lineup.'; end if;
    if jsonb_array_length(p_lineup->t->'players') <> 6 then raise exception 'Select six players per team.'; end if;
    for person in select value from jsonb_array_elements(p_lineup->t->'players') loop
      perform private.require_match_keys(person,array['id','name']);
      person_id := (person->>'id')::uuid;
      if person_id is null or person_id=any(seen) or not exists(select 1 from public.players where id=person_id and group_id=p_group and deleted_at is null and name=person->>'name') then
        raise exception 'Select twelve different players registered in this group.';
      end if;
      seen := array_append(seen,person_id);
    end loop;
  end loop;
end;
$$;


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
      select p.id,p.name,p.category,(p.deleted_at is not null) as removed,coalesce(pt.points,0) as points,coalesce(a.matches,0) as matches,
        coalesce(a.wins,0) as wins,coalesce(a.days,0) as days
      from public.players p left join attendance a on a.player_id=p.id left join points pt on pt.player_id=p.id
      where p.group_id=p_group_id and (p.deleted_at is null or coalesce(a.matches,0)>0)
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


commit;
