begin;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  display_number bigint generated always as identity unique,
  display_id text generated always as ('C-' || display_number::text) stored unique,
  name text not null check(char_length(btrim(name)) between 1 and 100),
  region text not null check(char_length(btrim(region)) between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.communities enable row level security;
revoke all on public.communities from public,anon,authenticated;

create table private.community_admins (
  community_id uuid not null references public.communities(id),
  user_id uuid not null references auth.users(id),
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now(),
  primary key(community_id,user_id)
);
create index community_admins_user_idx on private.community_admins(user_id);
alter table private.community_admins enable row level security;
revoke all on private.community_admins from public,anon,authenticated;
alter table public.groups add column community_id uuid references public.communities(id);
create index groups_community_idx on public.groups(community_id);

create function private.is_community_admin(p_community_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.community_admins where community_id=p_community_id and user_id=(select auth.uid()));
$$;
revoke all on function private.is_community_admin(uuid) from public,anon,authenticated;
grant execute on function private.is_community_admin(uuid) to authenticated;

create or replace function private.is_group_admin(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.group_admins where group_id=p_group_id and user_id=(select auth.uid()))
    or exists(select 1 from public.groups g join private.community_admins a on a.community_id=g.community_id where g.id=p_group_id and a.user_id=(select auth.uid()));
$$;

-- Existing players retain every group-local UUID. Community identity is an explicit link,
-- never a guess that two people with the same name are the same person.
create table private.community_people (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id),
  name text not null check(char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique(id,community_id)
);
alter table private.community_people enable row level security;
revoke all on private.community_people from public,anon,authenticated;
alter table public.players add column community_person_id uuid references private.community_people(id);
create unique index players_community_membership_idx on public.players(group_id,community_person_id) where community_person_id is not null;

-- Initial community requested by the owner. No existing group admin is promoted.
do $$
declare c uuid; owner_id uuid; item record; person uuid;
begin
  insert into public.communities(name,region) values('Montreal Volleyball Community','Montreal') returning id into c;
  select id into owner_id from auth.users where lower(email)='diogovvb@gmail.com' and email_confirmed_at is not null;
  if owner_id is not null then
    insert into private.community_admins(community_id,user_id,added_by) values(c,owner_id,owner_id);
  end if;
  update public.groups set community_id=c where community_id is null;
  for item in select id,name from public.players loop
    insert into private.community_people(community_id,name) values(c,item.name) returning id into person;
    update public.players set community_person_id=person where id=item.id;
  end loop;
end;
$$;

-- If the designated owner confirms their account after rollout, bootstrap only this exact
-- verified email; no client-supplied email or actor can claim the initial community.
create function public.claim_initial_community() returns void
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  if not exists(select 1 from auth.users where id=auth.uid() and lower(email)='diogovvb@gmail.com' and email_confirmed_at is not null) then return; end if;
  select id into c from public.communities where display_id='C-1';
  if c is not null and not exists(select 1 from private.community_admins where community_id=c) then
    insert into private.community_admins(community_id,user_id,added_by) values(c,auth.uid(),auth.uid()) on conflict do nothing;
  end if;
end;
$$;

create function private.link_community_player() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  select community_id into c from public.groups where id=new.group_id;
  if c is null then
    if new.community_person_id is not null then raise exception 'Player does not belong to this community.'; end if;
    return new;
  end if;
  if new.community_person_id is null then
    insert into private.community_people(community_id,name) values(c,new.name) returning id into new.community_person_id;
  elsif not exists(select 1 from private.community_people where id=new.community_person_id and community_id=c) then
    raise exception 'Player does not belong to this community.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function private.link_community_player() from public,anon,authenticated;
create trigger link_community_player before insert on public.players for each row execute function private.link_community_player();

create function public.list_my_communities() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.claim_initial_community();
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]'::jsonb) from public.communities c
    where private.is_community_admin(c.id));
end;
$$;

create function public.create_community(p_name text,p_region text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.communities;
begin
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in with a confirmed email first.' using errcode='42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_region is null or char_length(btrim(p_region)) not between 1 and 100 then raise exception 'Enter a community name and region with 1–100 characters.'; end if;
  insert into public.communities(name,region) values(btrim(p_name),btrim(p_region)) returning * into c;
  insert into private.community_admins(community_id,user_id,added_by) values(c.id,auth.uid(),auth.uid());
  return to_jsonb(c);
end;
$$;

create or replace function public.list_my_groups() returns setof public.groups
language sql stable security definer set search_path='' as $$
  select g.* from public.groups g where private.is_group_admin(g.id) order by g.name,g.id;
$$;

create function public.create_community_group(p_community_id uuid,p_name text,p_time_zone text default 'America/Toronto') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.groups;
begin
  perform 1 from public.communities where id=p_community_id for update;
  if not private.is_community_admin(p_community_id) then raise exception 'Only community administrators can create groups in this community.' using errcode='42501'; end if;
  select * into g from public.create_group(p_name,p_time_zone);
  update public.groups set community_id=p_community_id where id=g.id returning * into g;
  -- Community access is inherited and disappears on revocation.
  delete from private.group_admins where group_id=g.id and user_id=auth.uid();
  return to_jsonb(g);
end;
$$;

create function public.list_community_admins(p_community_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_community_admin(p_community_id) then raise exception 'Only community administrators can manage community access.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email) order by a.added_at,a.user_id),'[]'::jsonb)
    from private.community_admins a join auth.users u on u.id=a.user_id where a.community_id=p_community_id);
end;
$$;

create function public.grant_community_admin(p_community_id uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform 1 from public.communities where id=p_community_id for update;
  if not private.is_community_admin(p_community_id) then raise exception 'Only community administrators can manage community access.' using errcode='42501'; end if;
  select id into target from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'This email has no confirmed account.'; end if;
  insert into private.community_admins(community_id,user_id,added_by) values(p_community_id,target,auth.uid()) on conflict do nothing;
end;
$$;

create function public.revoke_community_admin(p_community_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.communities where id=p_community_id for update;
  if not private.is_community_admin(p_community_id) then raise exception 'Only community administrators can manage community access.' using errcode='42501'; end if;
  if (select count(*) from private.community_admins where community_id=p_community_id)<=1 and exists(select 1 from private.community_admins where community_id=p_community_id and user_id=p_user_id) then raise exception 'Keep at least one administrator in the community.'; end if;
  delete from private.community_admins where community_id=p_community_id and user_id=p_user_id;
end;
$$;

create function public.list_community_players(p_community_id uuid,p_query text default '',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_community_admin(p_community_id) then raise exception 'Only community administrators can browse community players.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or char_length(coalesce(p_query,''))>120 then raise exception 'Invalid player search or page.'; end if;
  return (with people as (
    select cp.id,cp.name,
      (select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'player_id',p.id) order by g.name,p.id)
        from public.players p join public.groups g on g.id=p.group_id
        where p.community_person_id=cp.id and g.community_id=p_community_id and p.deleted_at is null) as groups
    from private.community_people cp where cp.community_id=p_community_id
      and (private.normalize_player_name(cp.name) like '%'||private.normalize_player_name(coalesce(p_query,''))||'%')
      and exists(select 1 from public.players p where p.community_person_id=cp.id and p.deleted_at is null)
  ) select jsonb_build_object('total',(select count(*) from people),'page',p_page,'page_size',25,
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.name,p.id) from (select * from people order by name,id limit 25 offset ((p_page-1)*25)) p),'[]'::jsonb)));
end;
$$;

create function public.import_community_players(p_group_id uuid,p_person_ids uuid[],p_category text default 'sub') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.groups; person private.community_people; person_id uuid; existing public.players; added integer:=0;
begin
  select * into g from public.groups where id=p_group_id for update;
  if not found or not private.is_community_admin(g.community_id) then raise exception 'Only community administrators can add community players.' using errcode='42501'; end if;
  if p_category is null or p_category not in ('fixed','sub') or p_person_ids is null or cardinality(p_person_ids) not between 1 and 100 then raise exception 'Select 1–100 players and a valid category.'; end if;
  foreach person_id in array p_person_ids loop
    select * into person from private.community_people where id=person_id and community_id=g.community_id;
    if not found then raise exception 'Player does not belong to this community.' using errcode='42501'; end if;
    select * into existing from public.players where group_id=g.id and community_person_id=person.id;
    if found then
      if existing.deleted_at is not null then
        if exists(select 1 from public.players where group_id=g.id and id<>existing.id and deleted_at is null and normalized_name=existing.normalized_name) then raise exception 'A player with this name already exists in this group.' using errcode='23505'; end if;
        update public.players set deleted_at=null,category=p_category,version=version+1 where id=existing.id;
        added:=added+1;
      end if;
      continue;
    end if;
    if exists(select 1 from public.players where group_id=g.id and normalized_name=private.normalize_player_name(person.name)) then
      raise exception 'A different player named % already exists in this group. Review their identity before adding this player.',person.name using errcode='23505';
    end if;
    insert into public.players(group_id,name,category,community_person_id) values(g.id,person.name,p_category,person.id);
    added:=added+1;
  end loop;
  return jsonb_build_object('added',added);
end;
$$;

-- No global public table reads: the public entrypoints below require one explicit scope.
revoke select on public.groups,public.players,public.matches,public.match_sets,public.set_players,public.match_points,public.match_player_totals from anon;
drop policy groups_public_read on public.groups;
create policy groups_admin_read on public.groups for select to authenticated using(private.is_group_admin(id));
drop policy players_public_read on public.players;
create policy players_admin_read on public.players for select to authenticated using(private.is_group_admin(group_id));
drop policy matches_public_read on public.matches;
create policy matches_admin_read on public.matches for select to authenticated using(private.is_group_admin(group_id));
drop policy sets_public_read on public.match_sets;
create policy sets_admin_read on public.match_sets for select to authenticated using(private.is_group_admin(group_id));
drop policy set_players_public_read on public.set_players;
create policy set_players_admin_read on public.set_players for select to authenticated using(private.is_group_admin(group_id));
drop policy points_public_read on public.match_points;
create policy points_admin_read on public.match_points for select to authenticated using(private.is_group_admin(group_id));
drop policy totals_public_read on public.match_player_totals;
create policy totals_admin_read on public.match_player_totals for select to authenticated using(private.is_group_admin(group_id));

create function public.public_group_info(p_group_ref text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',g.id,'name',g.name,'display_id',g.display_id,'community_id',g.community_id,
    'community',case when c.id is null then null else jsonb_build_object('id',c.id,'display_id',c.display_id,'name',c.name,'region',c.region) end)
    into result from public.groups g left join public.communities c on c.id=g.community_id
    where g.id::text=lower(p_group_ref) or g.display_id=upper(p_group_ref);
  if result is null then raise exception 'Group not found.' using errcode='P0002'; end if;
  return result;
end;
$$;

create function public.public_community(p_community_ref text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.communities;
begin
  select * into c from public.communities where id::text=lower(p_community_ref) or display_id=upper(p_community_ref);
  if not found then raise exception 'Community not found.' using errcode='P0002'; end if;
  return jsonb_build_object('community',jsonb_build_object('id',c.id,'display_id',c.display_id,'name',c.name,'region',c.region),
    'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'display_id',g.display_id,'name',g.name) order by g.name,g.id),'[]'::jsonb) from public.groups g where g.community_id=c.id));
end;
$$;

create or replace function public.public_group_summary(p_group_id uuid, p_season integer default null, p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
      from public.matches m where m.group_id=p_group_id and m.published
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
      'group',public.public_group_info(v_group.id::text)||jsonb_build_object('time_zone',v_group.time_zone),
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


create or replace function public.public_group_period_summary(p_group_id uuid, p_season integer default null, p_page integer default 1, p_period text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
      from public.matches m where m.group_id=p_group_id and m.published
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
      'group',public.public_group_info(v_group.id::text)||jsonb_build_object('time_zone',v_group.time_zone),
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


create or replace function public.public_match_details(p_group_id uuid, p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id and published;
  if not found then raise exception 'Match not found in this group.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group',public.public_group_info(p_group_id::text)||(select jsonb_build_object('time_zone',g.time_zone) from public.groups g where g.id=p_group_id),
    'id',v_match.id,'player_totals_recorded',v_match.player_totals_recorded,'entry_mode',v_match.entry_mode,'rules',v_match.rules,'winner',v_match.winner,'decided_at',v_match.decided_at,'played_on',v_match.played_on,'group_id',v_match.group_id,'started_at',v_match.started_at,'closed_at',v_match.closed_at,'version',v_match.version,
    'team_a_name',coalesce(v_match.snapshot->>'team_a_name','Team 1'),
    'team_b_name',coalesce(v_match.snapshot->>'team_b_name','Team 2'),
    'sets_a',v_match.sets_a,
    'sets_b',v_match.sets_b,
    'players',case when v_match.entry_mode='summary' then (select coalesce(jsonb_agg(jsonb_build_object('id',player_id,'name',player_name,'team',team,'points',points,'result_team',result_team) order by team,player_name),'[]'::jsonb) from public.match_player_totals where match_id=v_match.id) else null end,
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


revoke all on function public.claim_initial_community(),public.list_my_communities(),public.create_community(text,text),public.create_community_group(uuid,text,text),public.list_community_admins(uuid),public.grant_community_admin(uuid,text),public.revoke_community_admin(uuid,uuid),public.list_community_players(uuid,text,integer),public.import_community_players(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.claim_initial_community(),public.list_my_communities(),public.create_community(text,text),public.create_community_group(uuid,text,text),public.list_community_admins(uuid),public.grant_community_admin(uuid,text),public.revoke_community_admin(uuid,uuid),public.list_community_players(uuid,text,integer),public.import_community_players(uuid,uuid[],text) to authenticated;
revoke all on function public.public_group_info(text),public.public_community(text) from public,anon,authenticated;
grant execute on function public.public_group_info(text),public.public_community(text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
