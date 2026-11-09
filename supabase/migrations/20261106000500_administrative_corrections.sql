begin;

-- Shared validation and relational rebuild; never callable by app roles.
create function private.write_match_contents(p_match jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_group uuid;
  v_started timestamptz;
  v_closed timestamptz;
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

  update public.matches set started_at=v_started,closed_at=v_closed,snapshot=p_match
    where id=v_id and group_id=v_group;
  if not found then raise exception 'Match not found.' using errcode='P0002'; end if;
  delete from public.match_sets where match_id=v_id;
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
end;
$$;
revoke all on function private.write_match_contents(jsonb) from public,anon,authenticated;

-- The upload contract and its immutable submission are preserved across revisions.
create or replace function public.submit_match(p_match jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_group uuid; v_existing public.matches; v_original jsonb;
begin
  perform private.require_match_keys(p_match,array['format_version','id','group_id','started_at','closed_at','team_a_name','team_b_name','sets']);
  v_id := (p_match->>'id')::uuid; v_group := (p_match->>'group_id')::uuid;
  perform 1 from public.groups where id=v_group for update;
  if not private.is_group_admin(v_group) then
    raise exception 'Only group administrators can submit matches.' using errcode='42501';
  end if;
  select * into v_existing from public.matches where id=v_id;
  if found then
    select submission into v_original from private.match_metadata where match_id=v_id;
    if v_existing.group_id<>v_group or v_original is distinct from p_match then
      raise exception 'This match ID already has a different submission. No data was replaced.' using errcode='23505';
    end if;
    return jsonb_build_object('status','already_saved','match_id',v_id,'group_id',v_group,
      'version',v_existing.version,'submission',v_original);
  end if;
  insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values(v_id,v_group,now(),0,0,'{}');
  perform private.write_match_contents(p_match);
  insert into private.match_metadata(match_id,submitted_by,submission) values(v_id,auth.uid(),p_match);
  return jsonb_build_object('status','saved','match_id',v_id,'group_id',v_group,'version',1,'submission',p_match);
end;
$$;

create function public.get_match_for_edit(p_group_id uuid,p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_match public.matches;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can correct matches.' using errcode='42501';
  end if;
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id;
  if not found then raise exception 'Match not found in this group.' using errcode='P0002'; end if;
  return jsonb_build_object(
    'group',(select jsonb_build_object('id',id,'name',name,'time_zone',time_zone) from public.groups where id=p_group_id),
    'version',v_match.version,'payload',v_match.snapshot,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]'::jsonb) from public.players where group_id=p_group_id)
  );
end;
$$;

create function public.correct_match(p_group_id uuid,p_match_id uuid,p_expected_version integer,p_match jsonb,p_reason text,p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_current public.matches; v_previous private.match_revisions; v_reason text := regexp_replace(p_reason,'^\s+|\s+$','','g');
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can correct matches.' using errcode='42501';
  end if;
  if p_expected_version is null or p_expected_version<1 or p_revision_id is null or v_reason is null or char_length(v_reason) not between 1 and 500 then
    raise exception 'Provide the loaded version, revision ID and a reason with 1–500 characters.' using errcode='22023';
  end if;
  select * into v_current from public.matches where id=p_match_id and group_id=p_group_id for update;
  if not found then raise exception 'Match not found in this group.' using errcode='P0002'; end if;
  select * into v_previous from private.match_revisions where id=p_revision_id;
  if found then
    if v_previous.match_id<>p_match_id or v_previous.group_id<>p_group_id or v_previous.author_id<>auth.uid()
      or v_previous.version<>p_expected_version+1 or v_previous.reason<>v_reason or v_previous.new_snapshot is distinct from p_match then
      raise exception 'This revision ID already belongs to a different correction.' using errcode='23505';
    end if;
    return jsonb_build_object('status','already_corrected','match_id',p_match_id,'group_id',p_group_id,
      'revision_id',p_revision_id,'version',v_previous.version,'current_version',v_current.version);
  end if;
  if v_current.version<>p_expected_version then
    raise exception 'This match has changed. Load the latest version and review your changes before saving.' using errcode='40001';
  end if;
  if p_match is not distinct from v_current.snapshot then
    raise exception 'No match changes to save.' using errcode='22023';
  end if;
  if (p_match->>'id')::uuid is distinct from p_match_id or (p_match->>'group_id')::uuid is distinct from p_group_id
    or p_match->'started_at' is distinct from v_current.snapshot->'started_at'
    or p_match->'closed_at' is distinct from v_current.snapshot->'closed_at'
    or p_match->'team_a_name' is distinct from v_current.snapshot->'team_a_name'
    or p_match->'team_b_name' is distinct from v_current.snapshot->'team_b_name' then
    raise exception 'Match identity, dates and team names cannot be changed here.' using errcode='22023';
  end if;
  perform private.write_match_contents(p_match);
  update public.matches set version=p_expected_version+1 where id=p_match_id;
  insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot)
    values(p_revision_id,p_match_id,p_group_id,auth.uid(),p_expected_version+1,v_reason,v_current.snapshot,p_match);
  return jsonb_build_object('status','corrected','match_id',p_match_id,'group_id',p_group_id,
    'revision_id',p_revision_id,'version',p_expected_version+1,'current_version',p_expected_version+1);
end;
$$;

create function public.match_revision_history(p_group_id uuid,p_match_id uuid,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can read correction history.' using errcode='42501';
  end if;
  if not exists(select 1 from public.matches where id=p_match_id and group_id=p_group_id) then
    raise exception 'Match not found in this group.' using errcode='P0002';
  end if;
  if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid history page.' using errcode='22023'; end if;
  return jsonb_build_object('match_id',p_match_id,'group_id',p_group_id,'page',p_page,'page_size',20,
    'total',(select count(*) from private.match_revisions where match_id=p_match_id),
    'revisions',(select coalesce(jsonb_agg(to_jsonb(r) order by r.version desc),'[]'::jsonb) from (
      select r.id,r.version,r.reason,r.created_at,r.author_id,u.email as author_email,r.previous_snapshot,r.new_snapshot
      from private.match_revisions r join auth.users u on u.id=r.author_id where r.match_id=p_match_id
      order by r.version desc limit 20 offset ((p_page-1)*20)
    ) r)
  );
end;
$$;

revoke all on function public.submit_match(jsonb),public.get_match_for_edit(uuid,uuid),
  public.correct_match(uuid,uuid,integer,jsonb,text,uuid),public.match_revision_history(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.submit_match(jsonb),public.get_match_for_edit(uuid,uuid),
  public.correct_match(uuid,uuid,integer,jsonb,text,uuid),public.match_revision_history(uuid,uuid,integer) to authenticated;

commit;
