begin;

-- Only finalized relational rows remain public. Everything received and edited is private.
create table private.game_days (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  play_date date not null,
  state text not null default 'open' check (state in ('open','closed')),
  version integer not null default 1,
  lineup_version integer not null default 0,
  code_hash bytea unique,
  published_at timestamptz,
  unique(group_id,play_date)
);
create table private.day_lineups (
  day_id uuid not null references private.game_days(id),
  version integer not null,
  lineup jsonb not null,
  created_at timestamptz not null default now(),
  primary key(day_id,version)
);
create table private.day_receipts (
  id uuid primary key,
  day_id uuid not null references private.game_days(id),
  submission jsonb not null,
  draft jsonb,
  decision text not null default 'pending' check (decision in ('pending','approved','excluded')),
  version integer not null default 1,
  received_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id),
  audit jsonb not null default '[]'::jsonb
);
create index day_receipts_day_idx on private.day_receipts(day_id);
create table private.day_audit (
  day_id uuid not null references private.game_days(id),
  version integer not null,
  author_id uuid not null references auth.users(id),
  reason text not null,
  previous_state jsonb not null,
  new_state jsonb not null,
  created_at timestamptz not null default now(),
  primary key(day_id,version)
);
alter table private.game_days enable row level security;
alter table private.day_lineups enable row level security;
alter table private.day_receipts enable row level security;
alter table private.day_audit enable row level security;
revoke all on private.game_days,private.day_lineups,private.day_receipts,private.day_audit from public,anon,authenticated;

-- Keep excluded publication rows and all their audit history, while hiding them everywhere.
alter table public.matches add column published boolean not null default true;
drop policy matches_public_read on public.matches;
create policy matches_public_read on public.matches for select to anon,authenticated using(published);
drop policy sets_public_read on public.match_sets;
drop policy set_players_public_read on public.set_players;
drop policy points_public_read on public.match_points;
create policy sets_public_read on public.match_sets for select to anon,authenticated using(exists(select 1 from public.matches m where m.id=match_id));
create policy set_players_public_read on public.set_players for select to anon,authenticated using(exists(select 1 from public.matches m where m.id=match_id));
create policy points_public_read on public.match_points for select to anon,authenticated using(exists(select 1 from public.matches m where m.id=match_id));

-- A set can include substitutes, including someone playing for both sides at different times.
alter table public.set_players drop constraint set_players_position_check;
alter table public.set_players add constraint set_players_position_check check(position between 1 and 100);
alter table public.set_players drop constraint set_players_match_id_set_number_player_id_key;
create or replace function private.write_match_contents(p_match jsonb)
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
      if jsonb_array_length(v_set->'rosters'->v_team) not between 6 and 100 then
        raise exception 'Each team must include at least six participants, including substitutes.' using errcode = '22023';
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


-- Validate with the same writer used for publication, but roll all provisional rows back.
create function private.validate_day_draft(p_match jsonb) returns void
language plpgsql set search_path='' as $$
begin
  begin
    insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot)
      values((p_match->>'id')::uuid,(p_match->>'group_id')::uuid,now(),0,0,'{}') on conflict(id) do nothing;
    perform private.write_match_contents(p_match);
    raise exception 'validation complete' using errcode='Z0001';
  exception when sqlstate 'Z0001' then null;
  end;
end;
$$;

create function private.check_day_lineup(p_group uuid,p_lineup jsonb) returns void
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
      if person_id is null or person_id=any(seen) or not exists(select 1 from public.players where id=person_id and group_id=p_group and name=person->>'name') then
        raise exception 'Select twelve different players registered in this group.';
      end if;
      seen := array_append(seen,person_id);
    end loop;
  end loop;
end;
$$;

create function private.check_received_match(p_match jsonb) returns void
language plpgsql set search_path='' as $$
declare s jsonb; seg jsonb; r jsonb; pt jsonb; active jsonb; team text; n integer; previous integer; i integer; seen jsonb := '{}'; signature jsonb;
begin
  perform private.require_match_keys(p_match,array['format_version','id','day_id','group_id','lineup_version','started_at','closed_at','team_a_name','team_b_name','sets']);
  if p_match->'format_version' is distinct from '2'::jsonb or octet_length(p_match::text)>4000000
    or jsonb_typeof(p_match->'sets') is distinct from 'array' then raise exception 'Invalid submission format or size.'; end if;
  if jsonb_array_length(p_match->'sets') not between 1 and 100 then raise exception 'Provide completed sets.'; end if;
  if (p_match->>'id')::uuid is null or (p_match->>'day_id')::uuid is null or (p_match->>'group_id')::uuid is null
    or jsonb_typeof(p_match->'closed_at') is distinct from 'string' or not isfinite((p_match->>'closed_at')::timestamptz)
    or jsonb_typeof(p_match->'started_at') not in ('string','null')
    or (p_match->>'started_at')::timestamptz > (p_match->>'closed_at')::timestamptz
    or (p_match->'started_at'<>'null'::jsonb and not isfinite((p_match->>'started_at')::timestamptz))
    or jsonb_typeof(p_match->'lineup_version') not in ('null','number') then raise exception 'Invalid submission identity or dates.'; end if;
  foreach team in array array['team_a_name','team_b_name'] loop
    if jsonb_typeof(p_match->team) is distinct from 'string' or char_length(btrim(p_match->>team)) not between 1 and 16 then raise exception 'Invalid team name.'; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    perform private.require_match_keys(s,array['team_a_name','team_b_name','score_a','score_b','segments','points']);
    foreach team in array array['team_a_name','team_b_name'] loop
      if jsonb_typeof(s->team) is distinct from 'string' or char_length(btrim(s->>team)) not between 1 and 16 then raise exception 'Invalid set name.'; end if;
    end loop;
    if jsonb_typeof(s->'points') is distinct from 'array' or jsonb_typeof(s->'segments') is distinct from 'array' then raise exception 'Invalid points or segments.'; end if;
    n := jsonb_array_length(s->'points');
    if n not between 1 and 10000 or jsonb_array_length(s->'segments') not between 1 and n then raise exception 'Invalid completed set.'; end if;
    previous := -1;
    for seg in select value from jsonb_array_elements(s->'segments') loop
      perform private.require_match_keys(seg,array['from_point','rosters']);
      if jsonb_typeof(seg->'from_point') is distinct from 'number' or (seg->>'from_point') !~ '^[0-9]+$'
        or (seg->>'from_point')::int<=previous or (seg->>'from_point')::int>=n or (previous=-1 and (seg->>'from_point')::int<>0) then raise exception 'Invalid segment boundary.'; end if;
      previous := (seg->>'from_point')::int;
      perform private.require_match_keys(seg->'rosters',array['A','B']);
      foreach team in array array['A','B'] loop
        if jsonb_typeof(seg->'rosters'->team) is distinct from 'array' then raise exception 'Invalid segment roster.'; end if;
        if jsonb_array_length(seg->'rosters'->team)<>6 then raise exception 'Keep six positions per team.'; end if;
        i := 0;
        for r in select value from jsonb_array_elements(seg->'rosters'->team) loop
          i := i+1;
          perform private.require_match_keys(r,array['key','name','hint_id','slot']);
          if jsonb_typeof(r->'key') is distinct from 'string' or char_length(r->>'key') not between 1 and 500
            or jsonb_typeof(r->'name') is distinct from 'string' or char_length(btrim(r->>'name')) not between 1 and 60
            or r->>'slot' is distinct from 'p'||i::text then raise exception 'Invalid recorded participant.'; end if;
          if jsonb_typeof(r->'hint_id') not in ('null','string') then raise exception 'Invalid identity hint.'; end if;
          signature := jsonb_build_object('team',team,'slot',r->'slot','name',r->'name','hint_id',r->'hint_id');
          if seen ? (r->>'key') and seen->(r->>'key') is distinct from signature then raise exception 'Participant key changed identity.'; end if;
          seen := seen||jsonb_build_object(r->>'key',signature);
        end loop;
      end loop;
    end loop;
    if jsonb_typeof(s->'score_a') is distinct from 'number' or jsonb_typeof(s->'score_b') is distinct from 'number'
      or (s->>'score_a') !~ '^[0-9]+$' or (s->>'score_b') !~ '^[0-9]+$'
      or (s->>'score_a')::int<>(select count(*) from jsonb_array_elements(s->'points') p where p->>'team'='A')
      or (s->>'score_b')::int<>(select count(*) from jsonb_array_elements(s->'points') p where p->>'team'='B') then raise exception 'Scores do not match points.'; end if;
    i := 0;
    for pt in select value from jsonb_array_elements(s->'points') loop
      perform private.require_match_keys(pt,array['team','participant_key','player_name','is_opponent_error']);
      if not coalesce(pt->>'team' in ('A','B'),false) or jsonb_typeof(pt->'is_opponent_error') is distinct from 'boolean' then raise exception 'Invalid point.'; end if;
      select x into active from jsonb_array_elements(s->'segments') x where (x->>'from_point')::int<=i order by (x->>'from_point')::int desc limit 1;
      if (pt->>'is_opponent_error')::boolean then
        if pt->'participant_key' is distinct from 'null'::jsonb or pt->'player_name' is distinct from 'null'::jsonb then raise exception 'Invalid opponent error.'; end if;
      elsif not exists(select 1 from jsonb_array_elements(active->'rosters'->(pt->>'team')) p where p->>'key'=pt->>'participant_key' and p->>'name'=pt->>'player_name') then
        raise exception 'Point author is not in its recorded segment.';
      end if;
      i := i+1;
    end loop;
  end loop;
end;
$$;

-- Validate old archives without requiring provisional players to exist in the registry.
-- Conversion is validation-only; the exact original remains the immutable receipt.
create function private.check_received_legacy(p_match jsonb,p_day uuid) returns void
language plpgsql set search_path='' as $$
declare converted jsonb; all_sets jsonb := '[]'; s jsonb; r jsonb; pt jsonb; roster jsonb; people jsonb; points jsonb; person jsonb; t text; i integer; canonical_id uuid;
begin
  perform private.require_match_keys(p_match,array['format_version','id','group_id','started_at','closed_at','team_a_name','team_b_name','sets']);
  if p_match->'format_version' is distinct from '1'::jsonb or jsonb_typeof(p_match->'sets') is distinct from 'array' or octet_length(p_match::text)>4000000 then raise exception 'Invalid legacy submission.'; end if;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    perform private.require_match_keys(s,array['team_a_name','team_b_name','score_a','score_b','rosters','points']);
    perform private.require_match_keys(s->'rosters',array['A','B']);
    roster := '{}';
    foreach t in array array['A','B'] loop
      if jsonb_typeof(s->'rosters'->t) is distinct from 'array' then raise exception 'Invalid legacy roster.'; end if;
      people := '[]'; i := 0;
      for person in select value from jsonb_array_elements(s->'rosters'->t) loop
        perform private.require_match_keys(person,array['id','name']);
        canonical_id := (person->>'id')::uuid;
        if canonical_id is null then raise exception 'Invalid legacy player identity.'; end if;
        i := i+1;
        people := people||jsonb_build_array(jsonb_build_object('key',jsonb_build_array(t,i,person->>'id',person->>'name')::text,'name',person->'name','hint_id',canonical_id,'slot','p'||i::text));
      end loop;
      roster := roster||jsonb_build_object(t,people);
    end loop;
    if jsonb_typeof(s->'points') is distinct from 'array' then raise exception 'Invalid legacy points.'; end if;
    points := '[]';
    for pt in select value from jsonb_array_elements(s->'points') loop
      perform private.require_match_keys(pt,array['team','player_id','player_name','is_opponent_error']);
      if jsonb_typeof(pt->'is_opponent_error') is distinct from 'boolean' or not coalesce(pt->>'team' in ('A','B'),false) then raise exception 'Invalid legacy point.'; end if;
      if (pt->>'is_opponent_error')::boolean then
        if pt->'player_id' is distinct from 'null'::jsonb or pt->'player_name' is distinct from 'null'::jsonb then raise exception 'Invalid legacy error.'; end if;
        r := null;
      else
        if jsonb_typeof(pt->'player_name') is distinct from 'string' or char_length(btrim(pt->>'player_name')) not between 1 and 60 then raise exception 'Invalid legacy point author.'; end if;
        canonical_id := (pt->>'player_id')::uuid;
        select value into r from jsonb_array_elements(roster->(pt->>'team')) where value->>'hint_id'=canonical_id::text;
        if not found then raise exception 'Legacy point author is outside its roster.'; end if;
      end if;
      points := points||jsonb_build_array(jsonb_build_object('team',pt->'team','participant_key',r->'key','player_name',r->'name','is_opponent_error',pt->'is_opponent_error'));
    end loop;
    all_sets := all_sets||jsonb_build_array((s-'rosters'-'points')||jsonb_build_object('segments',jsonb_build_array(jsonb_build_object('from_point',0,'rosters',roster)),'points',points));
  end loop;
  converted := (p_match-'format_version'-'sets')||jsonb_build_object('format_version',2,'day_id',p_day,'lineup_version',null,'sets',all_sets);
  perform private.check_received_match(converted);
end;
$$;

create function public.create_game_day(p_group_id uuid,p_date date,p_lineup jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; code text := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date.'; end if;
  perform private.check_day_lineup(p_group_id,p_lineup);
  insert into private.game_days(group_id,play_date,lineup_version,code_hash) values(p_group_id,p_date,1,sha256(convert_to(code,'UTF8'))) returning * into d;
  insert into private.day_lineups values(d.id,1,p_lineup,now());
  insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state) values(d.id,1,auth.uid(),'Created game day','{}',to_jsonb(d)-'code_hash');
  return jsonb_build_object('day',to_jsonb(d)-'code_hash','code',code);
end;
$$;

create function public.list_game_days(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg((to_jsonb(d)-'code_hash')||jsonb_build_object('code_active',d.code_hash is not null,'pending',(select count(*) from private.day_receipts r where r.day_id=d.id and r.decision='pending')) order by d.play_date desc),'[]'::jsonb) from private.game_days d where group_id=p_group_id);
end;
$$;

create function public.get_game_day(p_day_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d private.game_days;
begin
  select * into d from private.game_days where id=p_day_id;
  if not found or not private.is_group_admin(d.group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  return jsonb_build_object('day',to_jsonb(d)-'code_hash','lineup',(select lineup from private.day_lineups where day_id=d.id and version=d.lineup_version),
    'lineups',(select coalesce(jsonb_agg(to_jsonb(l) order by version),'[]'::jsonb) from private.day_lineups l where day_id=d.id),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by received_at,id),'[]'::jsonb) from private.day_receipts r where day_id=d.id),
    'history',(select coalesce(jsonb_agg(to_jsonb(a) order by version desc),'[]'::jsonb) from private.day_audit a where day_id=d.id));
end;
$$;

create function public.change_game_day(p_day_id uuid,p_expected_version integer,p_action text,p_lineup jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; previous jsonb; code text; item private.day_receipts; current_match public.matches;
begin
  -- Group lock order matches review, old ingestion and corrections.
  perform 1 from public.groups where id=(select group_id from private.game_days where id=p_day_id) for update;
  select * into d from private.game_days where id=p_day_id for update;
  if not found or not private.is_group_admin(d.group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  if p_expected_version is distinct from d.version then raise exception 'Day changed. Refresh before trying again.' using errcode='40001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Provide a reason with 1–500 characters.'; end if;
  previous := to_jsonb(d)-'code_hash';
  if p_action='lineup' then
    if d.state<>'open' then raise exception 'Reopen the day before changing its lineup.'; end if;
    perform private.check_day_lineup(d.group_id,p_lineup);
    d.lineup_version := d.lineup_version+1;
    insert into private.day_lineups values(d.id,d.lineup_version,p_lineup,now());
  elsif p_action='rotate_code' then
    code := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); d.code_hash := sha256(convert_to(code,'UTF8'));
  elsif p_action='revoke_code' then d.code_hash := null;
  elsif p_action='reopen' then
    if d.state<>'closed' then raise exception 'Day is already open.'; end if;
    d.state := 'open';
  elsif p_action='close' then
    if d.state<>'open' then raise exception 'Day is already closed.'; end if;
    if not exists(select 1 from private.day_receipts where day_id=d.id) or exists(select 1 from private.day_receipts where day_id=d.id and decision='pending') then raise exception 'Review all received matches before closing the day.'; end if;
    for item in select * from private.day_receipts where day_id=d.id order by id loop
      if item.decision='excluded' then
        update public.matches set published=false where id=item.id and group_id=d.group_id;
      else
        select * into current_match from public.matches where id=item.id;
        if found and current_match.group_id<>d.group_id then raise exception 'Match ID belongs to another group.'; end if;
        if found then
          if current_match.snapshot is distinct from item.draft then
            insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot)
              values(gen_random_uuid(),item.id,d.group_id,auth.uid(),current_match.version+1,p_reason,current_match.snapshot,item.draft);
            update public.matches set version=version+1 where id=item.id;
          end if;
        else
          insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values(item.id,d.group_id,now(),0,0,'{}');
          insert into private.match_metadata(match_id,submitted_by,submission) values(item.id,coalesce(item.submitted_by,auth.uid()),item.submission);
        end if;
        perform private.write_match_contents(item.draft);
        update public.matches set published=true where id=item.id;
      end if;
    end loop;
    d.state := 'closed'; d.published_at := now();
  else raise exception 'Unknown day action.'; end if;
  d.version := d.version+1;
  update private.game_days set state=d.state,version=d.version,lineup_version=d.lineup_version,code_hash=d.code_hash,published_at=d.published_at where id=d.id;
  insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state)
    values(d.id,d.version,auth.uid(),btrim(p_reason),previous,(to_jsonb(d)-'code_hash')||jsonb_build_object('action',p_action));
  return jsonb_build_object('day',to_jsonb(d)-'code_hash','code',code);
end;
$$;

create function public.redeem_day_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d private.game_days; g public.groups;
begin
  select * into d from private.game_days where code_hash=sha256(convert_to(p_code,'UTF8'));
  if not found then raise exception 'Code is invalid or revoked.' using errcode='42501'; end if;
  select * into g from public.groups where id=d.group_id;
  return jsonb_build_object('day_id',d.id,'group_id',g.id,'group_name',g.name,'time_zone',g.time_zone,'play_date',d.play_date,'lineup_version',d.lineup_version,
    'lineup',(select lineup from private.day_lineups where day_id=d.id and version=d.lineup_version));
end;
$$;

create function public.receive_day_match(p_code text,p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; r private.day_receipts;
begin
  -- Serializes with closing, revocation and rotation; the receipt commits before acknowledgement.
  select * into d from private.game_days where code_hash=sha256(convert_to(p_code,'UTF8')) for update;
  if not found then raise exception 'Code is invalid or revoked. Local match kept.' using errcode='42501'; end if;
  if p_match->'format_version'='1'::jsonb then
    perform private.check_received_legacy(p_match,d.id);
  else
    perform private.check_received_match(p_match);
    if (p_match->>'day_id')::uuid<>d.id then raise exception 'Code belongs to another game day.'; end if;
    if p_match->'lineup_version'<>'null'::jsonb and not exists(select 1 from private.day_lineups where day_id=d.id and version=(p_match->>'lineup_version')::int) then raise exception 'Unknown lineup version.'; end if;
  end if;
  if (p_match->>'group_id')::uuid<>d.group_id then raise exception 'Code belongs to another game day.'; end if;
  select * into r from private.day_receipts where id=(p_match->>'id')::uuid;
  if found then
    if r.day_id<>d.id or r.submission is distinct from p_match then raise exception 'Match ID already has a different submission.' using errcode='23505'; end if;
    return jsonb_build_object('status','already_received','match_id',r.id,'day_id',d.id,'submission',r.submission);
  end if;
  if exists(select 1 from public.matches where id=(p_match->>'id')::uuid) then raise exception 'Match ID is already published. Ask an administrator to review the existing result.' using errcode='23505'; end if;
  insert into private.day_receipts(id,day_id,submission,draft) values((p_match->>'id')::uuid,d.id,p_match,case when p_match->'format_version'='1'::jsonb then p_match else null end);
  update private.game_days set version=version+1 where id=d.id;
  return jsonb_build_object('status','received','match_id',p_match->>'id','day_id',d.id,'submission',p_match);
end;
$$;

create function public.review_day_match(p_match_id uuid,p_expected_version integer,p_decision text,p_draft jsonb,p_reason text,p_review_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.day_receipts; d private.game_days; previous jsonb; prior jsonb;
begin
  perform 1 from public.groups where id=(select g.group_id from private.game_days g join private.day_receipts incoming on incoming.day_id=g.id where incoming.id=p_match_id) for update;
  select g.* into d from private.game_days g join private.day_receipts incoming on incoming.day_id=g.id where incoming.id=p_match_id for update of g;
  if not found or not private.is_group_admin(d.group_id) then raise exception 'Only group administrators can review matches.' using errcode='42501'; end if;
  select * into r from private.day_receipts where id=p_match_id for update;
  if p_review_id is null then raise exception 'Provide a review ID.'; end if;
  select entry into prior from jsonb_array_elements(r.audit) entry where entry->>'review_id'=p_review_id::text;
  if found then
    if prior->>'author_id' is distinct from auth.uid()::text or prior->>'reason' is distinct from btrim(p_reason)
      or prior->'after'->>'decision' is distinct from p_decision or (prior->'before'->>'version')::int is distinct from p_expected_version
      or (p_decision='approved' and prior->'after'->'draft' is distinct from p_draft) then raise exception 'Review ID belongs to a different change.' using errcode='23505'; end if;
    return jsonb_build_object('status','already_reviewed','match_id',r.id,'version',(prior->'after'->>'version')::int);
  end if;
  if d.state<>'open' then raise exception 'Reopen the day before reviewing matches.'; end if;
  if p_expected_version is distinct from r.version then raise exception 'Match changed. Reload before reviewing.' using errcode='40001'; end if;
  if p_decision not in ('approved','excluded','pending') or p_decision is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Provide a decision and a reason with 1–500 characters.'; end if;
  previous := jsonb_build_object('draft',r.draft,'decision',r.decision,'version',r.version);
  if p_decision='approved' then
    if p_draft is null or (p_draft->>'id')::uuid is distinct from r.id or (p_draft->>'group_id')::uuid is distinct from d.group_id
      or p_draft->'started_at' is distinct from r.submission->'started_at' or p_draft->'closed_at' is distinct from r.submission->'closed_at' then raise exception 'Match identity and dates must match the receipt.'; end if;
    perform private.validate_day_draft(p_draft);
  end if;
  update private.day_receipts set draft=case when p_decision='approved' then p_draft else draft end,decision=p_decision,version=version+1,
    audit=audit||jsonb_build_array(jsonb_build_object('review_id',p_review_id,'author_id',auth.uid(),'at',now(),'reason',btrim(p_reason),'before',previous,
      'after',jsonb_build_object('draft',case when p_decision='approved' then p_draft else draft end,'decision',p_decision,'version',version+1))) where id=r.id;
  update private.game_days set version=version+1 where id=d.id;
  return jsonb_build_object('status','reviewed','match_id',r.id,'version',r.version+1);
end;
$$;

-- Existing public results retain their exact contents. Seed private review copies for future changes.
insert into private.game_days(group_id,play_date,state,published_at)
  select m.group_id,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date,'closed',now()
  from public.matches m join public.groups g on g.id=m.group_id group by m.group_id,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date;
insert into private.day_receipts(id,day_id,submission,draft,decision,submitted_by)
  select m.id,d.id,coalesce(md.submission,m.snapshot),m.snapshot,'approved',md.submitted_by
  from public.matches m join public.groups g on g.id=m.group_id
  join private.game_days d on d.group_id=m.group_id and d.play_date=(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date
  left join private.match_metadata md on md.match_id=m.id;

-- Old app versions may still upload. Acknowledge private durable storage, never publish directly.
create or replace function public.submit_match(p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid := (p_match->>'group_id')::uuid; d private.game_days; r private.day_receipts; dt date;
begin
  perform 1 from public.groups where id=g for update;
  if not private.is_group_admin(g) then raise exception 'Only group administrators can submit matches.' using errcode='42501'; end if;
  select * into r from private.day_receipts where id=(p_match->>'id')::uuid;
  if found then
    if r.submission is distinct from p_match then raise exception 'This match ID already has a different submission.' using errcode='23505'; end if;
    return jsonb_build_object('status','already_saved','match_id',r.id,'group_id',g,'version',coalesce((select version from public.matches where id=r.id),1),'submission',r.submission);
  end if;
  perform private.validate_day_draft(p_match);
  select (coalesce((p_match->>'started_at')::timestamptz,(p_match->>'closed_at')::timestamptz) at time zone time_zone)::date into dt from public.groups where id=g;
  insert into private.game_days(group_id,play_date) values(g,dt) on conflict(group_id,play_date) do nothing;
  select * into d from private.game_days where group_id=g and play_date=dt for update;
  insert into private.day_receipts(id,day_id,submission,draft,submitted_by) values((p_match->>'id')::uuid,d.id,p_match,p_match,auth.uid());
  update private.game_days set version=version+1 where id=d.id;
  return jsonb_build_object('status','saved','match_id',p_match->>'id','group_id',g,'version',1,'submission',p_match);
end;
$$;

-- Public match correction tools now lead to a staged revision, even for legacy results.
create or replace function public.get_match_for_edit(p_group_id uuid,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.day_receipts; d private.game_days;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can correct matches.' using errcode='42501'; end if;
  select * into r from private.day_receipts where id=p_match_id;
  select * into d from private.game_days where id=r.day_id and group_id=p_group_id;
  if not found then raise exception 'Match not found in this group.'; end if;
  return jsonb_build_object('day_id',d.id,'group',(select to_jsonb(g) from public.groups g where id=p_group_id),'version',r.version,'payload',r.draft,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.players where group_id=p_group_id));
end;
$$;
create or replace function public.correct_match(p_group_id uuid,p_match_id uuid,p_expected_version integer,p_match jsonb,p_reason text,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_group_admin(p_group_id) or not exists(select 1 from private.day_receipts r join private.game_days d on d.id=r.day_id where r.id=p_match_id and d.group_id=p_group_id) then raise exception 'Only group administrators can correct matches.' using errcode='42501'; end if;
  perform public.review_day_match(p_match_id,p_expected_version,'approved',p_match,p_reason,p_revision_id);
  return jsonb_build_object('status','corrected','match_id',p_match_id,'group_id',p_group_id,'revision_id',p_revision_id,'version',p_expected_version+1,'current_version',p_expected_version+1);
end;
$$;

revoke all on function private.validate_day_draft(jsonb),private.check_day_lineup(uuid,jsonb),private.check_received_match(jsonb),private.check_received_legacy(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.create_game_day(uuid,date,jsonb),public.list_game_days(uuid),public.get_game_day(uuid),public.change_game_day(uuid,integer,text,jsonb,text),public.review_day_match(uuid,integer,text,jsonb,text,uuid),public.redeem_day_code(text),public.receive_day_match(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_game_day(uuid,date,jsonb),public.list_game_days(uuid),public.get_game_day(uuid),public.change_game_day(uuid,integer,text,jsonb,text),public.review_day_match(uuid,integer,text,jsonb,text,uuid) to authenticated;
grant execute on function public.redeem_day_code(text),public.receive_day_match(text,jsonb) to anon,authenticated;

create or replace function public.public_match_details(p_group_id uuid, p_match_id uuid)
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
        'points',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.player_id=sp.player_id and pt.team=sp.team)
      ) order by sp.team,sp.position),'[]'::jsonb) from public.set_players sp where sp.match_id=s.match_id and sp.set_number=s.set_number),
      'errors_a',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='A' and pt.is_opponent_error),
      'errors_b',(select count(*) from public.match_points pt where pt.match_id=s.match_id and pt.set_number=s.set_number and pt.team='B' and pt.is_opponent_error)
    ) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=v_match.id)
  );
end;
$$;


commit;
