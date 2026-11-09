-- Complete, repeatable repair for installations still issuing the original long code.
-- Requires only the original game-day schema (20261107000100).
-- Does not reset data, change public references, or rotate already-issued codes.
begin;

create or replace function private.normalize_day_code(p_code text) returns text
language plpgsql immutable set search_path='' as $$
declare compact text := regexp_replace(p_code,'[-[:space:]]','','g');
begin
  -- Accept both current and previously issued short codes.
  if compact ~* '^([A-HJ-NP-Z2-9]{5}|[A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{12})$' then return upper(compact); end if;
  if compact ~* '^[0-9a-f]{64}$' then return lower(compact); end if;
  return btrim(p_code);
end;
$$;

create or replace function private.new_day_code() returns text
language plpgsql volatile set search_path='' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  entropy bytea;
  code text;
  i integer;
begin
  loop
    entropy := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text,'UTF8'));
    code := '';
    -- Five base-32 symbols, without separators.
    for i in 0..4 loop
      code := code || substr(alphabet,1 + get_byte(entropy,i) % 32,1);
    end loop;
    if not exists(select 1 from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(code),'UTF8'))) then
      return code;
    end if;
  end loop;
end;
$$;
revoke all on function private.normalize_day_code(text),private.new_day_code() from public,anon,authenticated;


create or replace function public.create_game_day(p_group_id uuid,p_date date,p_lineup jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; code text := private.new_day_code();
begin
  perform 1 from public.groups where id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can manage game days.' using errcode='42501'; end if;
  if p_date is null or not isfinite(p_date) then raise exception 'Choose a valid date.'; end if;
  perform private.check_day_lineup(p_group_id,p_lineup);
  insert into private.game_days(group_id,play_date,lineup_version,code_hash) values(p_group_id,p_date,1,sha256(convert_to(private.normalize_day_code(code),'UTF8'))) returning * into d;
  insert into private.day_lineups values(d.id,1,p_lineup,now());
  insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state) values(d.id,1,auth.uid(),'Created game day','{}',to_jsonb(d)-'code_hash');
  return jsonb_build_object('day',to_jsonb(d)-'code_hash','code',code);
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

create or replace function public.redeem_day_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d private.game_days; g public.groups;
begin
  select * into d from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(p_code),'UTF8'));
  if not found then raise exception 'Code is invalid or revoked.' using errcode='42501'; end if;
  select * into g from public.groups where id=d.group_id;
  return jsonb_build_object('day_id',d.id,'group_id',g.id,'group_name',g.name,'time_zone',g.time_zone,'play_date',d.play_date,'lineup_version',d.lineup_version,
    'lineup',(select lineup from private.day_lineups where day_id=d.id and version=d.lineup_version));
end;
$$;

create or replace function public.receive_day_match(p_code text,p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.game_days; r private.day_receipts;
begin
  -- Serializes with closing, revocation and rotation; the receipt commits before acknowledgement.
  select * into d from private.game_days where code_hash=sha256(convert_to(private.normalize_day_code(p_code),'UTF8')) for update;
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

-- Verify the public entry points actually use the new generator/normalizer.
do $$
begin
  if position('private.new_day_code()' in pg_get_functiondef('public.create_game_day(uuid,date,jsonb)'::regprocedure))=0
    or position('private.new_day_code()' in pg_get_functiondef('public.change_game_day(uuid,integer,text,jsonb,text)'::regprocedure))=0
    or position('private.normalize_day_code(p_code)' in pg_get_functiondef('public.redeem_day_code(text)'::regprocedure))=0
    or position('private.normalize_day_code(p_code)' in pg_get_functiondef('public.receive_day_match(text,jsonb)'::regprocedure))=0 then
    raise exception 'Game-day code repair was not applied completely.';
  end if;
end;
$$;
commit;
