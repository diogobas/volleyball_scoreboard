begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  time_zone text not null,
  created_at timestamptz not null default now()
);

create table private.group_admins (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_admins_user_id_idx on private.group_admins(user_id);

create function private.is_group_admin(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.group_admins
    where group_id = p_group_id and user_id = (select auth.uid()));
$$;
revoke all on function private.is_group_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_group_admin(uuid) to authenticated;

create function private.normalize_player_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(regexp_replace(normalize(btrim(p_name), NFD), U&'[\0300-\036f]', '', 'g'), '\s+', ' ', 'g'));
$$;
revoke all on function private.normalize_player_name(text) from public, anon, authenticated;
grant execute on function private.normalize_player_name(text) to authenticated;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  normalized_name text generated always as (private.normalize_player_name(name)) stored,
  created_at timestamptz not null default now(),
  unique (group_id, normalized_name),
  unique (id, group_id)
);

create function private.keep_player_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.group_id <> old.group_id then
    raise exception 'Player identity and group cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_player_identity() from public, anon, authenticated;
create trigger keep_player_identity before update on public.players
for each row execute function private.keep_player_identity();

create table public.matches (
  id uuid primary key,
  group_id uuid not null references public.groups(id),
  started_at timestamptz,
  closed_at timestamptz not null,
  sets_a integer not null check (sets_a >= 0),
  sets_b integer not null check (sets_b >= 0),
  format_version integer not null default 1 check (format_version = 1),
  version integer not null default 1 check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, group_id)
);
create index matches_group_closed_idx on public.matches(group_id, closed_at desc);

create table public.match_sets (
  match_id uuid not null,
  group_id uuid not null,
  set_number integer not null check (set_number >= 1),
  score_a integer not null check (score_a >= 0),
  score_b integer not null check (score_b >= 0),
  primary key (match_id, set_number),
  unique (match_id, set_number, group_id),
  foreign key (match_id, group_id) references public.matches(id, group_id) on delete cascade
);
create index match_sets_group_idx on public.match_sets(group_id);

create table public.set_players (
  match_id uuid not null,
  group_id uuid not null,
  set_number integer not null,
  team text not null check (team in ('A', 'B')),
  position integer not null check (position between 1 and 6),
  player_id uuid not null,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 60),
  primary key (match_id, set_number, team, position),
  unique (match_id, set_number, player_id),
  unique (match_id, set_number, team, player_id),
  foreign key (match_id, set_number, group_id) references public.match_sets(match_id, set_number, group_id) on delete cascade,
  foreign key (player_id, group_id) references public.players(id, group_id)
);
create index set_players_group_idx on public.set_players(group_id);
create index set_players_player_group_idx on public.set_players(player_id, group_id);

create table public.match_points (
  match_id uuid not null,
  group_id uuid not null,
  sequence integer not null check (sequence >= 1),
  set_number integer not null,
  team text not null check (team in ('A', 'B')),
  player_id uuid,
  player_name text,
  is_opponent_error boolean not null default false,
  primary key (match_id, sequence),
  check ((is_opponent_error and player_id is null and player_name is null)
    or (not is_opponent_error and player_id is not null and player_name is not null and char_length(btrim(player_name)) between 1 and 60)),
  foreign key (match_id, set_number, group_id) references public.match_sets(match_id, set_number, group_id) on delete cascade,
  foreign key (match_id, set_number, team, player_id) references public.set_players(match_id, set_number, team, player_id)
);
create index match_points_group_idx on public.match_points(group_id);
create index match_points_player_idx on public.match_points(player_id);

create table private.match_metadata (
  match_id uuid primary key references public.matches(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);
create table private.match_revisions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  group_id uuid not null,
  author_id uuid not null references auth.users(id),
  version integer not null check (version >= 2),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  previous_snapshot jsonb not null check (jsonb_typeof(previous_snapshot) = 'object'),
  new_snapshot jsonb not null check (jsonb_typeof(new_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (match_id, version),
  foreign key (match_id, group_id) references public.matches(id, group_id) on delete cascade
);
create index match_revisions_group_idx on private.match_revisions(group_id);

alter table public.groups enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_sets enable row level security;
alter table public.set_players enable row level security;
alter table public.match_points enable row level security;
alter table private.group_admins enable row level security;
alter table private.match_metadata enable row level security;
alter table private.match_revisions enable row level security;

create policy groups_public_read on public.groups for select to anon, authenticated using (true);
create policy players_public_read on public.players for select to anon, authenticated using (true);
create policy players_admin_insert on public.players for insert to authenticated with check (private.is_group_admin(group_id));
create policy players_admin_update on public.players for update to authenticated
  using (private.is_group_admin(group_id)) with check (private.is_group_admin(group_id));
create policy matches_public_read on public.matches for select to anon, authenticated using (true);
create policy sets_public_read on public.match_sets for select to anon, authenticated using (true);
create policy set_players_public_read on public.set_players for select to anon, authenticated using (true);
create policy points_public_read on public.match_points for select to anon, authenticated using (true);

revoke all on public.groups, public.players, public.matches, public.match_sets, public.set_players, public.match_points from public, anon, authenticated;
grant select on public.groups, public.players, public.matches, public.match_sets, public.set_players, public.match_points to anon, authenticated;
grant insert, update on public.players to authenticated;
revoke all on private.group_admins, private.match_metadata, private.match_revisions from public, anon, authenticated;

create function public.create_group(p_name text, p_time_zone text)
returns setof public.groups language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_group public.groups;
  v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'Sign in with a confirmed email first.' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'Enter a group name with 1–80 characters.' using errcode = '22023';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Choose a valid time zone.' using errcode = '22023';
  end if;
  insert into public.groups(name, time_zone) values (v_name, p_time_zone) returning * into v_group;
  insert into private.group_admins(group_id, user_id, added_by) values (v_group.id, v_user, v_user);
  return next v_group;
end;
$$;

create function public.list_my_groups()
returns setof public.groups language sql stable security definer set search_path = '' as $$
  select g.* from public.groups g join private.group_admins a on a.group_id = g.id
    where a.user_id = (select auth.uid()) order by g.name, g.id;
$$;

create function public.list_group_admins(p_group_id uuid)
returns table(user_id uuid, email text, added_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can manage access.' using errcode = '42501';
  end if;
  return query select a.user_id, u.email::text, a.added_at from private.group_admins a
    join auth.users u on u.id = a.user_id where a.group_id = p_group_id order by a.added_at, a.user_id;
end;
$$;

create function public.grant_group_admin(p_group_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target uuid;
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can manage access.' using errcode = '42501';
  end if;
  select id into v_target from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_target is null then
    raise exception 'This email has no confirmed account. Ask the person to sign up and confirm their email first.' using errcode = '22023';
  end if;
  insert into private.group_admins(group_id, user_id, added_by) values (p_group_id, v_target, auth.uid())
    on conflict (group_id, user_id) do nothing;
end;
$$;

create function public.revoke_group_admin(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can manage access.' using errcode = '42501';
  end if;
  if (select count(*) from private.group_admins where group_id = p_group_id) <= 1
      and exists (select 1 from private.group_admins where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'Keep at least one administrator in the group.' using errcode = '23514';
  end if;
  delete from private.group_admins where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke all on function public.create_group(text, text), public.list_my_groups(), public.list_group_admins(uuid),
  public.grant_group_admin(uuid, text), public.revoke_group_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_group(text, text), public.list_my_groups(), public.list_group_admins(uuid),
  public.grant_group_admin(uuid, text), public.revoke_group_admin(uuid, uuid) to authenticated;

comment on table public.matches is 'Public results only. Submission authors and administrative revisions belong in private tables. Ingestion RPC is added in phase 3.3.';
comment on table private.group_admins is 'Administrative access only; never exposed by a public view or Data API schema.';

commit;
