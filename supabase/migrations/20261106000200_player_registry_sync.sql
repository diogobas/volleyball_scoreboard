begin;

create function public.get_group_registry(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_group public.groups;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can synchronize players.' using errcode = '42501';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  return jsonb_build_object('group', to_jsonb(v_group), 'players',
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.name, p.id), '[]'::jsonb) from public.players p where p.group_id = p_group_id));
end;
$$;

create function public.sync_group_player(p_group_id uuid, p_player_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  v_normalized text;
  v_player public.players;
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can synchronize players.' using errcode = '42501';
  end if;
  if p_player_id is null or v_name is null or char_length(v_name) not between 1 and 60 then
    raise exception 'Provide a player ID and a name with 1–60 characters.' using errcode = '22023';
  end if;
  v_normalized := private.normalize_player_name(v_name);
  select * into v_player from public.players where id = p_player_id;
  if found then
    if v_player.group_id <> p_group_id then
      raise exception 'This player ID belongs to another group.' using errcode = '23505';
    end if;
    return jsonb_build_object('status', case when v_player.normalized_name = v_normalized then 'saved' else 'identity_conflict' end,
      'player', to_jsonb(v_player));
  end if;
  select * into v_player from public.players where group_id = p_group_id and
    (normalized_name = v_normalized or (position(' ' in v_normalized) = 0 and split_part(normalized_name, ' ', 1) = v_normalized))
    order by id limit 1;
  if found then
    return jsonb_build_object('status', 'name_conflict', 'player', to_jsonb(v_player));
  end if;
  insert into public.players(id, group_id, name) values (p_player_id, p_group_id, v_name) returning * into v_player;
  return jsonb_build_object('status', 'saved', 'player', to_jsonb(v_player));
end;
$$;

revoke all on function public.get_group_registry(uuid), public.sync_group_player(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_group_registry(uuid), public.sync_group_player(uuid, uuid, text) to authenticated;
-- All new client registrations pass through the idempotent, conflict-aware RPC.
revoke insert, update on public.players from authenticated;

commit;
