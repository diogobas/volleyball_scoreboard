begin;

-- Anonymous scoreboard operators do not impersonate a group administrator.
alter table private.match_metadata alter column submitted_by drop not null;

create function private.legacy_received_payload(p_match jsonb,p_day uuid) returns jsonb
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
  return converted;
end;
$$;

create function private.match_player(p_group uuid,p_hint text,p_name text,p_day uuid) returns jsonb
language plpgsql set search_path='' as $$
declare person public.players; clean text := regexp_replace(btrim(p_name),'\s+',' ','g');
begin
  if clean is null or char_length(clean) not between 1 and 60 then raise exception 'Each player needs a name with 1–60 characters.'; end if;
  -- A hint is useful only when its group and recorded name agree. Never merge by first name.
  select * into person from public.players p where p.group_id=p_group and p.id::text=p_hint and (
    p.normalized_name=private.normalize_player_name(clean) or exists(
      select 1 from private.day_lineups l cross join lateral jsonb_array_elements((l.lineup->'A'->'players')||(l.lineup->'B'->'players')) entry
      where l.day_id=p_day and entry->>'id'=p_hint and entry->>'name'=p_name
    )
  );
  if not found then
    select * into person from public.players where group_id=p_group and deleted_at is null and normalized_name=private.normalize_player_name(clean);
  end if;
  if not found then
    insert into public.players(group_id,name,category) values(p_group,clean,'sub') returning * into person;
  end if;
  return jsonb_build_object('id',person.id,'name',p_name);
end;
$$;

create function private.completed_payload(p_match jsonb,p_day uuid) returns jsonb
language plpgsql set search_path='' as $$
declare source jsonb := p_match; d private.game_days; s jsonb; segment jsonb; person jsonb; resolved jsonb;
  mapping jsonb := '{}'; rosters jsonb; points jsonb; sets jsonb := '[]'; active_ids uuid[]; team text; pt jsonb;
begin
  select * into strict d from private.game_days where id=p_day;
  if source->'format_version'='1'::jsonb then source := private.legacy_received_payload(source,p_day);
  else perform private.check_received_match(source); end if;
  if (source->>'group_id')::uuid is distinct from d.group_id or (source->>'day_id')::uuid is distinct from d.id then raise exception 'Match belongs to another game day.'; end if;
  if source->'lineup_version'<>'null'::jsonb and not exists(select 1 from private.day_lineups where day_id=d.id and version=(source->>'lineup_version')::integer) then raise exception 'Unknown lineup version.'; end if;
  for s in select value from jsonb_array_elements(source->'sets') loop
    rosters := '{"A":[],"B":[]}'::jsonb;
    for segment in select value from jsonb_array_elements(s->'segments') loop
      active_ids := array[]::uuid[];
      foreach team in array array['A','B'] loop
        for person in select value from jsonb_array_elements(segment->'rosters'->team) loop
          if not mapping ? (person->>'key') then
            mapping := mapping||jsonb_build_object(person->>'key',private.match_player(d.group_id,person->>'hint_id',person->>'name',d.id));
          end if;
          resolved := mapping->(person->>'key');
          active_ids := array_append(active_ids,(resolved->>'id')::uuid);
          if not exists(select 1 from jsonb_array_elements(rosters->team) p where p->>'id'=resolved->>'id') then
            rosters := jsonb_set(rosters,array[team],(rosters->team)||jsonb_build_array(resolved));
          end if;
        end loop;
      end loop;
      if (select count(distinct id) from unnest(active_ids) as ids(id))<>12 then
        raise exception 'Use twelve different player names in each lineup. This match was kept on the device.';
      end if;
    end loop;
    points := '[]';
    for pt in select value from jsonb_array_elements(s->'points') loop
      resolved := case when (pt->>'is_opponent_error')::boolean then null else mapping->(pt->>'participant_key') end;
      points := points||jsonb_build_array(jsonb_build_object('team',pt->'team','player_id',resolved->'id','player_name',resolved->'name','is_opponent_error',pt->'is_opponent_error'));
    end loop;
    sets := sets||jsonb_build_array((s-'segments'-'points')||jsonb_build_object('rosters',rosters,'points',points));
  end loop;
  return (source-'format_version'-'day_id'-'lineup_version'-'sets')||jsonb_build_object('format_version',1,'sets',sets);
end;
$$;

create function private.finalize_receipt(p_id uuid) returns void
language plpgsql set search_path='' as $$
declare d private.game_days; r private.day_receipts; existing public.matches; snapshot jsonb;
begin
  perform 1 from public.groups where id=(select g.group_id from private.game_days g join private.day_receipts incoming on incoming.day_id=g.id where incoming.id=p_id) for update;
  select g.* into strict d from private.game_days g join private.day_receipts incoming on incoming.day_id=g.id where incoming.id=p_id for update of g;
  select * into strict r from private.day_receipts where id=p_id for update;
  if r.decision='excluded' then return; end if;
  select * into existing from public.matches where id=r.id;
  if found then
    if existing.group_id<>d.group_id then raise exception 'Match ID belongs to another group.' using errcode='23505'; end if;
    -- Upload retries never overwrite a later administrative correction or deletion.
    if r.decision<>'approved' then update private.day_receipts set decision='approved',draft=existing.snapshot,version=version+1 where id=r.id; end if;
    return;
  end if;
  snapshot := coalesce(r.draft,private.completed_payload(r.submission,d.id));
  if r.decision<>'approved' then r.version:=r.version+1; end if;
  update private.day_receipts set decision='approved',draft=snapshot,version=r.version where id=r.id;
  insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,version,published) values(r.id,d.group_id,now(),0,0,'{}',r.version,true);
  perform private.write_match_contents(snapshot);
  insert into private.match_metadata(match_id,submitted_by,submission) values(r.id,r.submitted_by,r.submission);
end;
$$;

create function private.ingest_completed_match(p_day uuid,p_match jsonb,p_author uuid) returns jsonb
language plpgsql set search_path='' as $$
declare d private.game_days; r private.day_receipts; snapshot jsonb; existed boolean;
begin
  select * into strict d from private.game_days where id=p_day;
  select * into r from private.day_receipts where id=(p_match->>'id')::uuid for update;
  existed := found;
  if existed then
    if r.day_id<>d.id or r.submission is distinct from p_match then raise exception 'Match ID already has a different submission.' using errcode='23505'; end if;
  else
    snapshot := private.completed_payload(p_match,d.id);
    insert into private.day_receipts(id,day_id,submission,draft,decision,submitted_by) values((p_match->>'id')::uuid,d.id,p_match,snapshot,'approved',p_author) returning * into r;
  end if;
  perform private.finalize_receipt(r.id);
  if not existed then update private.game_days set version=version+1 where id=d.id; end if;
  return jsonb_build_object('status',case when existed then 'already_received' else 'received' end,'match_id',r.id,'day_id',d.id,'submission',r.submission,
    'published',coalesce((select published from public.matches where id=r.id),false),'deleted',r.decision='excluded','version',coalesce((select version from public.matches where id=r.id),r.version));
end;
$$;

create or replace function public.receive_day_match(p_code text,p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days;
begin
  select * into d from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(p_code),'UTF8'));
  if not found then raise exception 'Code is invalid or revoked. Local match kept.' using errcode='42501'; end if;
  perform 1 from public.groups where id=d.group_id for update;
  select * into d from private.game_days where id=d.id and code_hash=sha256(convert_to(private.normalize_day_code(p_code),'UTF8')) for update;
  if not found then raise exception 'Code is invalid or revoked. Local match kept.' using errcode='42501'; end if;
  return private.ingest_completed_match(d.id,p_match,auth.uid());
end;
$$;

create or replace function public.submit_match(p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid := (p_match->>'group_id')::uuid; d private.game_days; r private.day_receipts; dt date; result jsonb;
begin
  perform 1 from public.groups where id=g for update;
  if not private.is_group_admin(g) then raise exception 'Only group administrators can submit matches.' using errcode='42501'; end if;
  select * into r from private.day_receipts where id=(p_match->>'id')::uuid;
  if found then
    select * into d from private.game_days where id=r.day_id and group_id=g for update;
    if not found then raise exception 'Match belongs to another group.'; end if;
  else
    select (coalesce((p_match->>'started_at')::timestamptz,(p_match->>'closed_at')::timestamptz) at time zone time_zone)::date into dt from public.groups where id=g;
    insert into private.game_days(group_id,play_date) values(g,dt) on conflict(group_id,play_date) do nothing;
    select * into d from private.game_days where group_id=g and play_date=dt for update;
  end if;
  result := private.ingest_completed_match(d.id,p_match,auth.uid());
  return result||jsonb_build_object('status',case when result->>'status'='received' then 'saved' else 'already_saved' end,'group_id',g);
end;
$$;

create or replace function public.get_match_for_edit(p_group_id uuid,p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_match public.matches;
begin
  if not private.is_group_admin(p_group_id) then
    raise exception 'Only group administrators can correct matches.' using errcode='42501';
  end if;
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id and published;
  if not found then raise exception 'Match not found in this group.' using errcode='P0002'; end if;
  return jsonb_build_object(
    'group',(select jsonb_build_object('id',id,'name',name,'time_zone',time_zone) from public.groups where id=p_group_id),
    'version',v_match.version,'payload',v_match.snapshot,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]'::jsonb) from public.players where group_id=p_group_id)
  );
end;
$$;

create or replace function public.correct_match(p_group_id uuid,p_match_id uuid,p_expected_version integer,p_match jsonb,p_reason text,p_revision_id uuid)
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
  select * into v_current from public.matches where id=p_match_id and group_id=p_group_id and published for update;
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
    or p_match->'closed_at' is distinct from v_current.snapshot->'closed_at' then
    raise exception 'Match identity and recorded dates cannot be changed here.' using errcode='22023';
  end if;
  perform private.write_match_contents(p_match);
  update public.matches set version=p_expected_version+1 where id=p_match_id;
  insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot)
    values(p_revision_id,p_match_id,p_group_id,auth.uid(),p_expected_version+1,v_reason,v_current.snapshot,p_match);
  update private.day_receipts set draft=p_match,decision='approved',version=p_expected_version+1,
    audit=audit||jsonb_build_array(jsonb_build_object('author_id',auth.uid(),'at',now(),'reason',v_reason,'action','corrected','revision_id',p_revision_id)) where id=p_match_id;
  update private.game_days set version=version+1 where id=(select day_id from private.day_receipts where id=p_match_id);
  return jsonb_build_object('status','corrected','match_id',p_match_id,'group_id',p_group_id,
    'revision_id',p_revision_id,'version',p_expected_version+1,'current_version',p_expected_version+1);
end;
$$;

create or replace function public.change_game_day(p_day_id uuid,p_expected_version integer,p_action text,p_lineup jsonb,p_reason text) returns jsonb
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
    code := private.new_day_code(); d.code_hash := sha256(convert_to(private.normalize_day_code(code),'UTF8'));
  elsif p_action='revoke_code' then d.code_hash := null;
  elsif p_action='reopen' then
    if d.state<>'closed' then raise exception 'Day is already open.'; end if;
    d.state := 'open';
  elsif p_action='close' then
    if d.state<>'open' then raise exception 'Day is already closed.'; end if;
    d.state := 'closed'; d.published_at := now();
  else raise exception 'Unknown day action.'; end if;
  d.version := d.version+1;
  update private.game_days set state=d.state,version=d.version,lineup_version=d.lineup_version,code_hash=d.code_hash,published_at=d.published_at where id=d.id;
  insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state)
    values(d.id,d.version,auth.uid(),btrim(p_reason),previous,(to_jsonb(d)-'code_hash')||jsonb_build_object('action',p_action));
  return jsonb_build_object('day',to_jsonb(d)-'code_hash','code',code);
end;
$$;

create table private.match_deletions (
  match_id uuid primary key references public.matches(id) on delete cascade,
  group_id uuid not null references public.groups(id),
  author_id uuid not null references auth.users(id),
  reason text not null,
  deleted_at timestamptz not null default now()
);
alter table private.match_deletions enable row level security;
revoke all on private.match_deletions from public,anon,authenticated;

create function public.delete_final_match(p_group_id uuid,p_match_id uuid,p_expected_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.matches; d private.game_days;
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can delete matches.' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Provide a reason with 1–500 characters.'; end if;
  select g.* into d from private.game_days g join private.day_receipts r on r.day_id=g.id where r.id=p_match_id and g.group_id=p_group_id for update of g;
  select * into m from public.matches where id=p_match_id and group_id=p_group_id for update;
  if not found then raise exception 'Match not found in this group.' using errcode='P0002'; end if;
  if exists(select 1 from private.match_deletions where match_id=m.id) then return; end if;
  if p_expected_version is distinct from m.version then raise exception 'Match changed. Refresh before deleting.' using errcode='40001'; end if;
  insert into private.match_deletions(match_id,group_id,author_id,reason) values(m.id,m.group_id,auth.uid(),btrim(p_reason));
  update public.matches set published=false,version=version+1 where id=m.id;
  update private.day_receipts set decision='excluded',version=m.version+1 where id=m.id;
  update private.game_days set version=version+1 where id=d.id;
end;
$$;

-- Compatibility for older administration clients; never return a completed match to pending.
create or replace function public.review_day_match(p_match_id uuid,p_expected_version integer,p_decision text,p_draft jsonb,p_reason text,p_review_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid; result jsonb;
begin
  select d.group_id into g from private.day_receipts r join private.game_days d on d.id=r.day_id where r.id=p_match_id;
  if not private.is_group_admin(g) then raise exception 'Only group administrators can edit matches.' using errcode='42501'; end if;
  if p_decision='excluded' then
    perform public.delete_final_match(g,p_match_id,p_expected_version,p_reason);
  elsif p_decision='approved' then
    result:=public.correct_match(g,p_match_id,p_expected_version,p_draft,p_reason,p_review_id);
  else raise exception 'Matches are finalized on sync. Edit or delete the match instead.'; end if;
  return coalesce(result,jsonb_build_object('status','reviewed','match_id',p_match_id,'version',p_expected_version+1));
end;
$$;

create function public.list_group_matches(p_group_id uuid,p_season integer default null,p_day_id uuid default null,p_query text default '',p_page integer default 1,p_page_size integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.groups;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage matches.' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not in (5,10,25) or char_length(coalesce(p_query,''))>120
    or (p_season is not null and p_season not between 1 and 9999) then raise exception 'Invalid search or match page.'; end if;
  select * into strict g from public.groups where id=p_group_id;
  if p_day_id is not null and not exists(select 1 from private.game_days where id=p_day_id and group_id=g.id) then raise exception 'Game day not found in this group.'; end if;
  return (with all_matches as (
    select m.*,d.id as day_id,d.play_date as day_date,coalesce(m.started_at,m.closed_at) as played_at,
      (coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date as played_date
    from public.matches m left join private.day_receipts r on r.id=m.id left join private.game_days d on d.id=r.day_id
    where m.group_id=g.id and m.published
  ), filtered as (
    select m.* from all_matches m where (p_day_id is null or m.day_id=p_day_id) and (p_season is null or extract(year from m.played_date)=p_season)
      and (coalesce(btrim(p_query),'')='' or position(private.normalize_player_name(p_query) in private.normalize_player_name(concat_ws(' ',m.played_date::text,m.day_date::text,m.snapshot->>'team_a_name',m.snapshot->>'team_b_name')))>0
        or exists(select 1 from public.set_players sp where sp.match_id=m.id and position(private.normalize_player_name(p_query) in private.normalize_player_name(sp.player_name))>0))
  ), totals as (
    select count(*) as total,greatest(1,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::int))) as page from filtered
  ), page_matches as (
    select * from filtered order by played_at desc,id desc limit p_page_size offset (select (page-1)*p_page_size from totals)
  ) select jsonb_build_object('group',to_jsonb(g),'page',(select page from totals),'page_size',p_page_size,'total',(select total from totals),
    'seasons',(select coalesce(jsonb_agg(year order by year desc),'[]'::jsonb) from (select distinct extract(year from played_date)::int as year from all_matches union select extract(year from now() at time zone g.time_zone)::int) years),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'version',m.version,'started_at',m.started_at,'closed_at',m.closed_at,'day_id',m.day_id,'day_date',m.day_date,
      'team_a_name',m.snapshot->>'team_a_name','team_b_name',m.snapshot->>'team_b_name','sets_a',m.sets_a,'sets_b',m.sets_b,
      'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb) from public.match_sets s where s.match_id=m.id)
    ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)));
end;
$$;

revoke all on function private.legacy_received_payload(jsonb,uuid),private.match_player(uuid,text,text,uuid),private.completed_payload(jsonb,uuid),private.finalize_receipt(uuid),private.ingest_completed_match(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.delete_final_match(uuid,uuid,integer,text),public.list_group_matches(uuid,integer,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.delete_final_match(uuid,uuid,integer,text),public.list_group_matches(uuid,integer,uuid,text,integer,integer) to authenticated;

-- Existing valid pending matches follow the same finalized flow. Exclusions are preserved.
do $$
declare item record;
begin
  for item in select r.id from private.day_receipts r join private.game_days d on d.id=r.day_id where r.decision<>'excluded' order by d.group_id,d.id,r.id loop
    perform private.finalize_receipt(item.id);
  end loop;
end;
$$;

commit;
