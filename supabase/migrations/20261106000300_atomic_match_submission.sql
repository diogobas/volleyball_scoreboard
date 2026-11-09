begin;

-- Immutable original submission: retries cannot overwrite later admin corrections.
alter table private.match_metadata add column submission jsonb;

create function private.require_match_keys(p_value jsonb, p_keys text[])
returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' or not (p_value ?& p_keys)
    or p_value - p_keys <> '{}'::jsonb then
    raise exception 'Invalid match fields.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.require_match_keys(jsonb, text[]) from public, anon, authenticated;

create function public.submit_match(p_match jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_group uuid;
  v_started timestamptz;
  v_closed timestamptz;
  v_existing public.matches;
  v_original jsonb;
  v_set jsonb;
  v_person jsonb;
  v_point jsonb;
  v_team text;
  v_set_number integer := 0;
  v_position integer;
  v_sequence integer := 0;
  v_score_a integer;
  v_score_b integer;
  v_sets_a integer := 0;
  v_sets_b integer := 0;
begin
  perform private.require_match_keys(p_match, array['format_version','id','group_id','started_at','closed_at','team_a_name','team_b_name','sets']);
  if p_match->'format_version' is distinct from '1'::jsonb or
    jsonb_typeof(p_match->'id') <> 'string' or jsonb_typeof(p_match->'group_id') <> 'string' then
    raise exception 'Invalid match identity or format.' using errcode = '22023';
  end if;
  v_id := (p_match->>'id')::uuid;
  v_group := (p_match->>'group_id')::uuid;
  -- Serialize submissions in a group. A concurrent retry sees the committed row.
  perform 1 from public.groups where id = v_group for update;
  if not private.is_group_admin(v_group) then
    raise exception 'Only group administrators can submit matches.' using errcode = '42501';
  end if;
  select * into v_existing from public.matches where id = v_id;
  if found then
    select submission into v_original from private.match_metadata where match_id = v_id;
    if v_existing.group_id <> v_group or v_original is distinct from p_match then
      raise exception 'This match ID already has a different submission. No data was replaced.' using errcode = '23505';
    end if;
    return jsonb_build_object('status','already_saved','match_id',v_id,'group_id',v_group,
      'version',v_existing.version,'submission',v_original);
  end if;

  if jsonb_typeof(p_match->'closed_at') <> 'string' or
    jsonb_typeof(p_match->'started_at') not in ('string','null') then
    raise exception 'Invalid match dates.' using errcode = '22023';
  end if;
  v_closed := (p_match->>'closed_at')::timestamptz;
  v_started := (p_match->>'started_at')::timestamptz;
  if not isfinite(v_closed) or (v_started is not null and (not isfinite(v_started) or v_started > v_closed)) then
    raise exception 'Invalid match dates.' using errcode = '22023';
  end if;
  foreach v_team in array array['team_a_name','team_b_name'] loop
    if jsonb_typeof(p_match->v_team) <> 'string' or char_length(btrim(p_match->>v_team)) not between 1 and 16 then
      raise exception 'Invalid team name.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_match->'sets') <> 'array' then
    raise exception 'Provide the completed sets.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_match->'sets') = 0 then
    raise exception 'Provide at least one completed set.' using errcode = '22023';
  end if;

  insert into public.matches(id,group_id,started_at,closed_at,sets_a,sets_b,snapshot)
    values(v_id,v_group,v_started,v_closed,0,0,p_match);
  for v_set in select value from jsonb_array_elements(p_match->'sets') loop
    v_set_number := v_set_number + 1;
    perform private.require_match_keys(v_set, array['team_a_name','team_b_name','score_a','score_b','rosters','points']);
    foreach v_team in array array['team_a_name','team_b_name'] loop
      if jsonb_typeof(v_set->v_team) <> 'string' or char_length(btrim(v_set->>v_team)) not between 1 and 16 then
        raise exception 'Invalid set team name.' using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(v_set->'score_a') <> 'number' or jsonb_typeof(v_set->'score_b') <> 'number'
      or (v_set->>'score_a') !~ '^[0-9]+$' or (v_set->>'score_b') !~ '^[0-9]+$' then
      raise exception 'Set scores must be nonnegative integers.' using errcode = '22023';
    end if;
    v_score_a := (v_set->>'score_a')::integer;
    v_score_b := (v_set->>'score_b')::integer;
    if jsonb_typeof(v_set->'points') <> 'array' then
      raise exception 'Invalid set points.' using errcode = '22023';
    end if;
    if v_score_a::bigint + v_score_b = 0 or
      (select count(*) from jsonb_array_elements(v_set->'points') p where p->>'team' = 'A') <> v_score_a or
      (select count(*) from jsonb_array_elements(v_set->'points') p where p->>'team' = 'B') <> v_score_b then
      raise exception 'Set scores do not match their points.' using errcode = '22023';
    end if;
    insert into public.match_sets values(v_id,v_group,v_set_number,v_score_a,v_score_b);
    perform private.require_match_keys(v_set->'rosters', array['A','B']);
    foreach v_team in array array['A','B'] loop
      if jsonb_typeof(v_set->'rosters'->v_team) <> 'array' then
        raise exception 'Invalid set roster.' using errcode = '22023';
      end if;
      if jsonb_array_length(v_set->'rosters'->v_team) <> 6 then
        raise exception 'Each team must have six players.' using errcode = '22023';
      end if;
      v_position := 0;
      for v_person in select value from jsonb_array_elements(v_set->'rosters'->v_team) loop
        v_position := v_position + 1;
        perform private.require_match_keys(v_person, array['id','name']);
        if jsonb_typeof(v_person->'id') <> 'string' or jsonb_typeof(v_person->'name') <> 'string' then
          raise exception 'Invalid player identity or name.' using errcode = '22023';
        end if;
        insert into public.set_players values(v_id,v_group,v_set_number,v_team,v_position,
          (v_person->>'id')::uuid,v_person->>'name');
      end loop;
    end loop;
    for v_point in select value from jsonb_array_elements(v_set->'points') loop
      v_sequence := v_sequence + 1;
      perform private.require_match_keys(v_point, array['team','player_id','player_name','is_opponent_error']);
      if jsonb_typeof(v_point->'team') <> 'string' or jsonb_typeof(v_point->'is_opponent_error') <> 'boolean'
        or jsonb_typeof(v_point->'player_id') not in ('string','null')
        or jsonb_typeof(v_point->'player_name') not in ('string','null') then
        raise exception 'Invalid point fields.' using errcode = '22023';
      end if;
      insert into public.match_points values(v_id,v_group,v_sequence,v_set_number,v_point->>'team',
        (v_point->>'player_id')::uuid,v_point->>'player_name',(v_point->>'is_opponent_error')::boolean);
    end loop;
    v_sets_a := v_sets_a + case when v_score_a > v_score_b then 1 else 0 end;
    v_sets_b := v_sets_b + case when v_score_b > v_score_a then 1 else 0 end;
  end loop;
  update public.matches set sets_a = v_sets_a, sets_b = v_sets_b where id = v_id;
  insert into private.match_metadata(match_id,submitted_by,submission) values(v_id,auth.uid(),p_match);
  return jsonb_build_object('status','saved','match_id',v_id,'group_id',v_group,'version',1,'submission',p_match);
end;
$$;

revoke all on function public.submit_match(jsonb) from public, anon, authenticated;
grant execute on function public.submit_match(jsonb) to authenticated;

commit;
