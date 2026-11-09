begin;

-- Short public references are separate from the UUIDs used by existing records/devices.
alter table public.groups add column display_number bigint generated always as identity unique;
alter table public.groups add column display_id text generated always as ('G-' || display_number::text) stored unique;
alter table public.players add column display_number bigint generated always as identity unique;
alter table public.players add column display_id text generated always as ('P-' || display_number::text) stored unique;

create function private.normalize_day_code(p_code text) returns text
language plpgsql immutable set search_path='' as $$
declare compact text := regexp_replace(p_code,'[-[:space:]]','','g');
begin
  if compact ~* '^[A-HJ-NP-Z2-9]{12}$' then return upper(compact); end if;
  -- Existing 64-character codes keep their original hash and remain usable.
  if compact ~* '^[0-9a-f]{64}$' then return lower(compact); end if;
  return btrim(p_code);
end;
$$;

create function private.new_day_code() returns text
language plpgsql volatile set search_path='' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  entropy bytea := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text,'UTF8'));
  code text := '';
  i integer;
begin
  -- Twelve independent base-32 symbols (60 bits); omit 0, 1, I and O.
  for i in 0..11 loop
    if i in (4,8) then code := code || '-'; end if;
    code := code || substr(alphabet,1 + get_byte(entropy,i) % 32,1);
  end loop;
  return code;
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

create or replace function public.public_group_summary(p_group_id uuid, p_season integer default null, p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_group public.groups;
  v_season integer;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
  v_season := coalesce(p_season, extract(year from current_timestamp at time zone v_group.time_zone)::integer);
  if v_season not between 1 and 9999 or p_page is null or p_page not between 1 and 100000 then
    raise exception 'Invalid season or page.' using errcode = '22023';
  end if;
  return (
    with all_matches as (
      select m.*, (coalesce(m.started_at,m.closed_at) at time zone v_group.time_zone)::date as played_date,
        coalesce(m.started_at,m.closed_at) as played_at,
        (select count(*) from public.match_sets s where s.match_id=m.id and s.score_a>s.score_b) as won_a,
        (select count(*) from public.match_sets s where s.match_id=m.id and s.score_b>s.score_a) as won_b
      from public.matches m where m.group_id=p_group_id
    ), season_matches as (
      select *, case when won_a>won_b then 'A' when won_b>won_a then 'B' else null end as winner
      from all_matches where extract(year from played_date)=v_season
    ), participation as (
      select sp.player_id,sp.match_id,count(distinct sp.team) as teams,min(sp.team) as sole_team
      from public.set_players sp join season_matches m on m.id=sp.match_id
      where sp.group_id=p_group_id and exists (
        select 1 from public.match_points pt where pt.match_id=sp.match_id and pt.set_number=sp.set_number
      ) group by sp.player_id,sp.match_id
    ), attendance as (
      select p.player_id,count(*) as matches,count(distinct m.played_date) as days,
        count(*) filter(where p.teams=1 and p.sole_team=m.winner) as wins
      from participation p join season_matches m on m.id=p.match_id group by p.player_id
    ), points as (
      select pt.player_id,count(*) as points from public.match_points pt
      join season_matches m on m.id=pt.match_id where not pt.is_opponent_error group by pt.player_id
    ), player_totals as (
      select p.id,p.name,p.display_id,p.category,(p.deleted_at is not null) as removed,coalesce(pt.points,0) as points,coalesce(a.matches,0) as matches,
        coalesce(a.wins,0) as wins,coalesce(a.days,0) as days
      from public.players p left join attendance a on a.player_id=p.id left join points pt on pt.player_id=p.id
      where p.group_id=p_group_id and (p.deleted_at is null or coalesce(a.matches,0)>0)
    ), page_matches as (
      select * from season_matches order by played_at desc,id desc limit 25 offset ((p_page-1)*25)
    )
    select jsonb_build_object(
      'group',jsonb_build_object('id',v_group.id,'display_id',v_group.display_id,'name',v_group.name,'time_zone',v_group.time_zone),
      'season',v_season,'page',p_page,'page_size',25,
      'seasons',(select jsonb_agg(year order by year desc) from (
        select distinct extract(year from played_date)::integer as year from all_matches
        union select extract(year from current_timestamp at time zone v_group.time_zone)::integer
        union select v_season
      ) years),
      'match_count',(select count(*) from season_matches),
      'point_count',(select count(*) from public.match_points pt join season_matches m on m.id=pt.match_id),
      'participant_count',(select count(*) from player_totals where matches>0),
      'fallback_dates',(select count(*) from season_matches where started_at is null),
      'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.points desc,p.wins desc,p.name,p.id) from player_totals p),'[]'::jsonb),
      'matches',coalesce((select jsonb_agg(jsonb_build_object(
        'id',m.id,'started_at',m.started_at,'closed_at',m.closed_at,'played_date',m.played_date,'version',m.version,
        'team_a_name',coalesce(m.snapshot->>'team_a_name','Team 1'),
        'team_b_name',coalesce(m.snapshot->>'team_b_name','Team 2'),
        'sets_a',m.won_a,'sets_b',m.won_b,
        'sets',(select coalesce(jsonb_agg(jsonb_build_object('number',s.set_number,'score_a',s.score_a,'score_b',s.score_b) order by s.set_number),'[]'::jsonb)
          from public.match_sets s where s.match_id=m.id)
      ) order by m.played_at desc,m.id desc) from page_matches m),'[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.public_match_details(p_group_id uuid, p_match_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_match public.matches;
begin
  select * into v_match from public.matches where id=p_match_id and group_id=p_group_id;
  if not found then raise exception 'Match not found in this group.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group',(select jsonb_build_object('id',g.id,'display_id',g.display_id,'name',g.name,'time_zone',g.time_zone) from public.groups g where g.id=p_group_id),
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
