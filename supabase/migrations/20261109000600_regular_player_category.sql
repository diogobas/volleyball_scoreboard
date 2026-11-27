begin;

alter table public.players drop constraint players_category_check;
update public.players set category = 'regular' where category = 'fixed';
alter table public.players add constraint players_category_check check (category in ('regular','sub'));

-- Older admin clients may still submit fixed. Normalize at the RPC boundary so
-- comparisons, retries, and stored records always use regular.
create or replace function public.save_group_player(p_group_id uuid,p_player_id uuid,p_name text,p_category text,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_player public.players; v_name text := regexp_replace(btrim(p_name),'\s+',' ','g');
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage players.' using errcode='42501'; end if;
  p_category := case when p_category = 'fixed' then 'regular' else p_category end;
  if p_player_id is null or v_name is null or char_length(v_name) not between 1 and 60 or p_category is null or p_category not in ('regular','sub') then
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

create or replace function public.save_group_player_profile(p_group_id uuid,p_player_id uuid,p_name text,p_category text,p_sex text,p_preferred_positions text[],p_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.players; saved public.players; clean_name text:=regexp_replace(btrim(p_name),'\s+',' ','g'); positions text[];
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage players.' using errcode='42501'; end if;
  p_category := case when p_category = 'fixed' then 'regular' else p_category end;
  if (p_sex is not null and p_sex not in ('female','male','other')) or not private.valid_player_positions(p_preferred_positions) then raise exception 'Choose a valid sex and preferred positions.' using errcode='22023'; end if;
  -- Store positions in the fixed display order, so reordering a selection is not a change.
  select coalesce(array_agg(code order by ord),'{}'::text[]) into positions
    from unnest(array['S','MB','O','OH','LB']::text[]) with ordinality as options(code,ord) where code=any(p_preferred_positions);
  select * into previous from public.players where id=p_player_id;
  if found then
    if previous.group_id<>p_group_id then raise exception 'This player belongs to another group.' using errcode='42501'; end if;
    if previous.deleted_at is not null then raise exception 'This player was deleted. Refresh the registry.' using errcode='P0002'; end if;
    if previous.name=clean_name and previous.category=p_category and previous.sex is not distinct from p_sex and previous.preferred_positions=positions then return to_jsonb(previous); end if;
    if p_expected_version is distinct from previous.version then raise exception 'This player changed. Refresh before editing again.' using errcode='40001'; end if;
  end if;
  -- Reuse the existing name/category validation and preserve the legacy save contract.
  perform public.save_group_player(p_group_id,p_player_id,p_name,p_category,p_expected_version);
  update public.players set sex=p_sex,preferred_positions=positions,
    version=case when previous.id is null then version else previous.version+1 end
    where id=p_player_id returning * into saved;
  return to_jsonb(saved);
end;
$$;

create or replace function public.import_community_players(p_group_id uuid,p_person_ids uuid[],p_category text default 'sub') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.groups; person private.community_people; person_id uuid; existing public.players; added integer:=0;
begin
  select * into g from public.groups where id=p_group_id for update;
  if not found or not private.is_community_admin(g.community_id) then raise exception 'Only community administrators can add community players.' using errcode='42501'; end if;
  p_category := case when p_category = 'fixed' then 'regular' else p_category end;
  if p_category is null or p_category not in ('regular','sub') or p_person_ids is null or cardinality(p_person_ids) not between 1 and 100 then raise exception 'Select 1–100 players and a valid category.'; end if;
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

commit;
