begin;

create table private.day_deletions (
  day_id uuid primary key,
  group_id uuid not null references public.groups(id),
  author_id uuid not null references auth.users(id),
  reason text not null,
  previous_state jsonb not null,
  deleted_at timestamptz not null default now()
);
alter table private.day_deletions enable row level security;
revoke all on private.day_deletions from public,anon,authenticated;

create or replace function public.list_game_days(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg((to_jsonb(d)-'code_hash')||jsonb_build_object(
    'code_active',d.code_hash is not null,
    'pending',(select count(*) from private.day_receipts r where r.day_id=d.id and r.decision='pending'),
    'match_count',(select count(*) from private.day_receipts r where r.day_id=d.id),
    'published_count',(select count(*) from private.day_receipts r join public.matches m on m.id=r.id and m.group_id=d.group_id where r.day_id=d.id and m.published),
    'team_a_name',(select l.lineup->'A'->>'name' from private.day_lineups l where l.day_id=d.id and l.version=d.lineup_version),
    'team_b_name',(select l.lineup->'B'->>'name' from private.day_lineups l where l.day_id=d.id and l.version=d.lineup_version)
  ) order by d.play_date desc),'[]'::jsonb) from private.game_days d where d.group_id=p_group_id);
end;
$$;

create function public.edit_game_day(p_day_id uuid,p_expected_version integer,p_date date,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; previous jsonb;
begin
  perform 1 from public.groups where id=(select group_id from private.game_days where id=p_day_id) for update;
  select * into d from private.game_days where id=p_day_id for update;
  if not found or not private.is_group_admin(d.group_id) then raise exception 'Only group administrators can edit game days.' using errcode='42501'; end if;
  if p_expected_version is distinct from d.version then raise exception 'Day changed. Refresh before editing.' using errcode='40001'; end if;
  if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date.' using errcode='22023'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Provide a reason with 1–500 characters.' using errcode='22023'; end if;
  previous := to_jsonb(d)-'code_hash';
  update private.game_days set play_date=p_date,version=version+1 where id=d.id returning * into d;
  insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state)
    values(d.id,d.version,auth.uid(),btrim(p_reason),previous,(to_jsonb(d)-'code_hash')||jsonb_build_object('action','edit'));
  return to_jsonb(d)-'code_hash';
exception when unique_violation then
  raise exception 'A game day already exists on this date.' using errcode='23505';
end;
$$;

create function public.delete_game_day(p_group_id uuid,p_day_id uuid,p_expected_version integer,p_reason text) returns void
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

revoke all on function public.edit_game_day(uuid,integer,date,text),public.delete_game_day(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.edit_game_day(uuid,integer,date,text),public.delete_game_day(uuid,uuid,integer,text) to authenticated;

commit;
