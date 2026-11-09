-- ONE-TIME, DESTRUCTIVE maintenance requested for this exact group.
-- Apply 20261108000100_player_administration.sql first, then execute this entire file
-- in the Supabase SQL Editor. Group identity, administrators and accounts are preserved.
begin;
create table if not exists private.data_resets (
  group_id uuid not null references public.groups(id),
  reset_key text not null,
  executed_at timestamptz not null default now(),
  primary key(group_id,reset_key)
);
alter table private.data_resets enable row level security;
revoke all on private.data_resets from public,anon,authenticated;

do $$
declare
  target uuid := '653c2c8d-9903-4410-b109-c66320f7300c';
  group_name text;
begin
  select name into group_name from public.groups where id=target for update;
  if group_name is distinct from 'Tuesday Volleyball ‐ 7:30PM-10PM' then
    raise exception 'Expected Tuesday Volleyball group was not found. Nothing was reset.';
  end if;
  if exists(select 1 from private.data_resets where group_id=target and reset_key='2026-11-08-fixed-roster') then
    raise exception 'This reset was already applied. Nothing was changed.';
  end if;
  -- Remove public results and private submissions together, including all old operator codes.
  delete from public.match_points where group_id=target;
  delete from public.set_players where group_id=target;
  delete from public.matches where group_id=target;
  delete from private.day_receipts where day_id in(select id from private.game_days where group_id=target);
  delete from private.day_lineups where day_id in(select id from private.game_days where group_id=target);
  delete from private.day_audit where day_id in(select id from private.game_days where group_id=target);
  delete from private.game_days where group_id=target;
  -- Retain UUID tombstones so an old device cannot restore removed identities.
  update public.players set deleted_at=now(),version=version+1 where group_id=target and deleted_at is null;
  insert into public.players(group_id,name,category)
    select target,name,'fixed' from unnest(array[
      'Anderson','Carlos','Chicó','Diogo','Diego','Geraldo','Jota','KJ','Gaëtan','Phillip','Omer','Kaue','Dimitri'
    ]) as names(name);
  insert into private.data_resets(group_id,reset_key) values(target,'2026-11-08-fixed-roster');
end;
$$;
commit;

select name,category from public.players where group_id='653c2c8d-9903-4410-b109-c66320f7300c' and deleted_at is null order by name;
