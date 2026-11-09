begin;

create or replace function public.save_historical_match(p_group_id uuid,p_match jsonb,p_expected_version integer,p_reason text,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare g public.groups; m public.matches; d private.game_days; old private.match_revisions; person jsonb; canonical jsonb;
  players jsonb:='[]'; s jsonb; score_a integer:=0; score_b integer:=0; points_a integer; points_b integer;
  result jsonb; result_sets jsonb; interrupted_set integer; snapshot jsonb; id uuid:=(p_match->>'id')::uuid; dt date:=(p_match->>'played_on')::date;
  set_number integer:=0; counts_a integer:=0; counts_b integer:=0; training boolean; target integer; high integer; low integer;
  old_day uuid; seen text[]:=array[]::text[]; result_team text; person_key text; clean_reason text:=btrim(p_reason); timestamp_on timestamptz; record_totals boolean:=coalesce((p_match->>'player_totals_recorded')::boolean,true);
begin
  perform 1 from public.groups where public.groups.id=p_group_id for update;
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can register historical matches.' using errcode='42501'; end if;
  select * into strict g from public.groups where public.groups.id=p_group_id;
  perform private.require_match_keys(p_match-'player_totals_recorded'-'ended_as_draw',array['format_version','id','group_id','played_on','rules','team_a_name','team_b_name','sets','players','errors_a','errors_b']);
  if p_match->'format_version' is distinct from '3'::jsonb or (p_match->>'group_id')::uuid is distinct from g.id or id is null or dt is null or not isfinite(dt)
    or p_match->>'rules' is null or p_match->>'rules' not in ('official','recreational') or p_revision_id is null or clean_reason is null or char_length(clean_reason) not between 1 and 500
    or jsonb_typeof(p_match->'team_a_name') is distinct from 'string' or jsonb_typeof(p_match->'team_b_name') is distinct from 'string' or char_length(btrim(p_match->>'team_a_name')) not between 1 and 16 or char_length(btrim(p_match->>'team_b_name')) not between 1 and 16 then raise exception 'Invalid historical match details.'; end if;
  select * into m from public.matches where public.matches.id=id for update;
  if found and (m.group_id<>g.id or m.entry_mode<>'summary' or not m.published) then raise exception 'This match cannot be replaced by a historical summary.'; end if;
  select * into old from private.match_revisions where private.match_revisions.id=p_revision_id;
  if found then
    if old.match_id<>id or old.group_id<>g.id or old.author_id<>auth.uid() or old.reason<>clean_reason or old.new_snapshot->'source' is distinct from p_match then raise exception 'Revision ID belongs to another change.'; end if;
    return jsonb_build_object('id',id,'version',old.version);
  end if;
  if m.id is not null and p_expected_version is distinct from m.version then raise exception 'Match changed. Refresh before editing.' using errcode='40001'; end if;
  if m.id is null and p_expected_version is not null then raise exception 'Historical match not found.'; end if;
  if octet_length(p_match::text)>4000000 or jsonb_array_length(p_match->'players')>200 or jsonb_typeof(p_match->'sets') is distinct from 'array' or jsonb_array_length(p_match->'sets') not between 1 and 100 or jsonb_typeof(p_match->'players') is distinct from 'array' then raise exception 'Provide sets and players.'; end if;
  if p_match ? 'ended_as_draw' and jsonb_typeof(p_match->'ended_as_draw') is distinct from 'boolean' then raise exception 'Invalid draw option.'; end if;
  result_sets:=p_match->'sets';
  if coalesce((p_match->>'ended_as_draw')::boolean,false) then
    s:=result_sets->(jsonb_array_length(result_sets)-1);
    target:=case when p_match->>'rules'='official' and jsonb_array_length(result_sets)=5 then 15 else 25 end;
    high:=greatest((s->>'score_a')::int,(s->>'score_b')::int); low:=least((s->>'score_a')::int,(s->>'score_b')::int);
    if s->'early_finish'='true'::jsonb and not ((high=target and low<=target-2) or (high>target and high=low+2)) then
      interrupted_set:=jsonb_array_length(result_sets); result_sets:=result_sets-(interrupted_set-1);
    end if;
  end if;
  if coalesce((p_match->>'ended_as_draw')::boolean,false) and private.match_result(result_sets)->>'winner' is not null then raise exception 'A match already won cannot be ended as a draw.'; end if;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    perform private.require_match_keys(s,array['score_a','score_b','early_finish']);
    if jsonb_typeof(s->'score_a') is distinct from 'number' or jsonb_typeof(s->'score_b') is distinct from 'number' or (s->>'score_a') !~ '^[0-9]+$' or (s->>'score_b') !~ '^[0-9]+$' or jsonb_typeof(s->'early_finish') is distinct from 'boolean' then raise exception 'Invalid set score.'; end if;
    high:=greatest((s->>'score_a')::int,(s->>'score_b')::int); low:=least((s->>'score_a')::int,(s->>'score_b')::int);
    set_number:=set_number+1; training:=counts_a=3 or counts_b=3;
    if high=low and not (coalesce((p_match->>'ended_as_draw')::boolean,false) and set_number=jsonb_array_length(p_match->'sets') and (s->>'early_finish')::boolean and high>0) then raise exception 'A tied set must be the interrupted final set of a match ended as a draw.'; end if;
    target:=case when p_match->>'rules'='official' and set_number=5 then 15 else 25 end;
    if not training and not ((high=target and low<=target-2) or (high>target and high=low+2))
      and (p_match->>'rules'='official' or not (s->>'early_finish')::boolean)
      and not (coalesce((p_match->>'ended_as_draw')::boolean,false) and set_number=jsonb_array_length(p_match->'sets') and (s->>'early_finish')::boolean and high>0) then raise exception 'Set % needs a valid winning score or an explicit recreational early finish.',set_number; end if;
    if not training and set_number is distinct from interrupted_set then
      if (s->>'score_a')::int>(s->>'score_b')::int then counts_a:=counts_a+1; elsif (s->>'score_b')::int>(s->>'score_a')::int then counts_b:=counts_b+1; end if;
    end if;
    score_a:=score_a+(s->>'score_a')::int; score_b:=score_b+(s->>'score_b')::int;
  end loop;
  if p_match ? 'player_totals_recorded' and jsonb_typeof(p_match->'player_totals_recorded') is distinct from 'boolean' then raise exception 'Invalid player totals option.'; end if;
  if record_totals then
    for person in select value from jsonb_array_elements(p_match->'players') loop
      perform private.require_match_keys(person-'result_team',array['team','player_id','name','points']);
      if person->>'team' not in ('A','B') or person->>'team' is null or person->>'points' is null or (person->>'points') !~ '^[0-9]+$' then raise exception 'Invalid player totals.'; end if;
      canonical:=private.match_player(g.id,person->>'player_id',person->>'name',null);
      person_key:=(canonical->>'id')||':'||(person->>'team');
      if person_key=any(seen) then raise exception 'Use a different player in each row of the same team.'; end if;
      seen:=array_append(seen,person_key);
      result_team:=case when person ? 'result_team' then person->>'result_team' else person->>'team' end;
      if result_team is not null and result_team not in ('A','B') then raise exception 'Invalid competitive team.'; end if;
      if exists(select 1 from jsonb_array_elements(players) p where p->>'player_id'=canonical->>'id' and p->>'result_team' is distinct from result_team) then
        raise exception 'Choose the same competitive team for both entries of a player who changed teams.';
      end if;
      players:=players||jsonb_build_array(person||jsonb_build_object('player_id',canonical->'id','result_team',result_team));
    end loop;
    if exists(select 1 from jsonb_array_elements(players) p where p->>'result_team' is not null
      and not exists(select 1 from jsonb_array_elements(players) other where other->>'player_id'=p->>'player_id' and other->>'team'=p->>'result_team')) then
      raise exception 'Competitive team must be one the player participated in.';
    end if;
    if (select count(*) from jsonb_array_elements(players) p where p->>'team'='A')<6 or (select count(*) from jsonb_array_elements(players) p where p->>'team'='B')<6 then raise exception 'Include at least six players per team.'; end if;
    if p_match->>'errors_a' is null or p_match->>'errors_b' is null or (p_match->>'errors_a') !~ '^[0-9]+$' or (p_match->>'errors_b') !~ '^[0-9]+$' then raise exception 'Enter nonnegative opponent errors.'; end if;
    select coalesce(sum((p->>'points')::int) filter(where p->>'team'='A'),0)+(p_match->>'errors_a')::int,
      coalesce(sum((p->>'points')::int) filter(where p->>'team'='B'),0)+(p_match->>'errors_b')::int into points_a,points_b from jsonb_array_elements(players) p;
    if points_a<>score_a or points_b<>score_b then raise exception 'Player points plus opponent errors must equal the set score totals (% and %).',score_a,score_b; end if;
  elsif p_match->'players' is distinct from '[]'::jsonb or p_match->'errors_a' is distinct from 'null'::jsonb or p_match->'errors_b' is distinct from 'null'::jsonb then
    raise exception 'Score-only matches must omit player totals and opponent errors.';
  end if;
  result:=private.match_result(result_sets);
  snapshot:=p_match||jsonb_build_object('players',players,'source',p_match,'draw_interrupted_set',interrupted_set);
  timestamp_on:=(dt+time '12:00') at time zone g.time_zone;
  insert into private.game_days(group_id,play_date,state) values(g.id,dt,'closed') on conflict(group_id,play_date) do nothing;
  select * into strict d from private.game_days where group_id=g.id and play_date=dt for update;
  if m.id is not null then select day_id into old_day from private.day_receipts where private.day_receipts.id=id; end if;
  if m.id is null then
    insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,entry_mode,played_on,rules,winner,decided_at)
      values(id,g.id,timestamp_on,(result->>'sets_a')::int,(result->>'sets_b')::int,snapshot,'summary',dt,p_match->>'rules',result->>'winner',(result->>'decided_at')::int);
    insert into private.match_metadata(match_id,submitted_by,submission) values(id,auth.uid(),p_match);
    insert into private.day_receipts(id,day_id,submission,draft,decision,submitted_by) values(id,d.id,p_match,snapshot,'approved',auth.uid());
    -- Creation uses the same revision token as retries without inventing a second match.
    insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot) values(p_revision_id,id,g.id,auth.uid(),2,clean_reason,'{}',snapshot);
    update public.matches set version=2 where public.matches.id=id;
  else
    delete from public.match_sets where match_id=id;
    delete from public.match_player_totals where match_id=id;
    insert into private.match_revisions(id,match_id,group_id,author_id,version,reason,previous_snapshot,new_snapshot) values(p_revision_id,id,g.id,auth.uid(),m.version+1,clean_reason,m.snapshot,snapshot);
    update public.matches set closed_at=timestamp_on,played_on=dt,rules=p_match->>'rules',snapshot=snapshot,version=m.version+1,sets_a=(result->>'sets_a')::int,sets_b=(result->>'sets_b')::int,winner=result->>'winner',decided_at=(result->>'decided_at')::int where public.matches.id=id;
    update private.day_receipts set day_id=d.id,draft=snapshot,version=m.version+1 where private.day_receipts.id=id;
  end if;
  update public.matches set player_totals_recorded=record_totals where public.matches.id=id;
  set_number:=0;
  for s in select value from jsonb_array_elements(p_match->'sets') loop
    set_number:=set_number+1; insert into public.match_sets values(id,g.id,set_number,(s->>'score_a')::int,(s->>'score_b')::int);
  end loop;
  insert into public.match_player_totals(match_id,group_id,team,player_id,player_name,points,result_team)
    select id,g.id,p->>'team',(p->>'player_id')::uuid,p->>'name',(p->>'points')::int,p->>'result_team' from jsonb_array_elements(players) p;
  update private.game_days set version=version+1 where private.game_days.id=d.id;
  if old_day is not null and old_day<>d.id then update private.game_days set version=version+1 where private.game_days.id=old_day; end if;
  return jsonb_build_object('id',id,'version',coalesce(m.version,1)+1);
end;
$$;


create or replace function public.get_historical_match(p_group_id uuid,p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.matches;
begin
  if not private.is_group_admin(p_group_id) then raise exception 'Only group administrators can edit historical matches.' using errcode='42501'; end if;
  select * into strict m from public.matches where id=p_match_id and group_id=p_group_id and entry_mode='summary' and published;
  return jsonb_build_object('version',m.version,'payload',(m.snapshot-'source'-'draw_interrupted_set')||jsonb_build_object('player_totals_recorded',m.player_totals_recorded),'players',(select coalesce(jsonb_agg(to_jsonb(p) order by name),'[]'::jsonb) from public.players p where group_id=p_group_id and deleted_at is null));
end;
$$;

create function private.with_draw_results(p_data jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_set(p_data,'{matches}',coalesce((select jsonb_agg(
    item.value || jsonb_build_object('ended_as_draw',coalesce(m.snapshot->'ended_as_draw','false'::jsonb),'draw_interrupted_set',m.snapshot->'draw_interrupted_set') ||
      case when item.value ? 'player_result' and m.snapshot->'ended_as_draw'='true'::jsonb then jsonb_build_object('player_result','draw') else '{}'::jsonb end
    order by item.ordinality)
    from jsonb_array_elements(p_data->'matches') with ordinality item(value,ordinality)
    join public.matches m on m.id=(item.value->>'id')::uuid),'[]'::jsonb));
$$;
revoke all on function private.with_draw_results(jsonb) from public,anon,authenticated;

alter function public.public_group_summary(uuid,integer,integer) set schema private;
alter function private.public_group_summary(uuid,integer,integer) rename to public_group_summary_before_draw;
revoke all on function private.public_group_summary_before_draw(uuid,integer,integer) from public,anon,authenticated;
create function public.public_group_summary(p_group_id uuid,p_season integer default null,p_page integer default 1) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.with_draw_results(private.public_group_summary_before_draw(p_group_id,p_season,p_page));
$$;
revoke all on function public.public_group_summary(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.public_group_summary(uuid,integer,integer) to anon,authenticated;

alter function public.public_group_period_summary(uuid,integer,integer,text) set schema private;
alter function private.public_group_period_summary(uuid,integer,integer,text) rename to public_group_period_summary_before_draw;
revoke all on function private.public_group_period_summary_before_draw(uuid,integer,integer,text) from public,anon,authenticated;
create function public.public_group_period_summary(p_group_id uuid,p_season integer default null,p_page integer default 1,p_period text default 'all') returns jsonb
language sql stable security definer set search_path='' as $$
  select private.with_draw_results(private.public_group_period_summary_before_draw(p_group_id,p_season,p_page,p_period));
$$;
revoke all on function public.public_group_period_summary(uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.public_group_period_summary(uuid,integer,integer,text) to anon,authenticated;

alter function public.list_group_matches(uuid,integer,uuid,text,integer,integer) set schema private;
alter function private.list_group_matches(uuid,integer,uuid,text,integer,integer) rename to list_group_matches_before_draw;
revoke all on function private.list_group_matches_before_draw(uuid,integer,uuid,text,integer,integer) from public,anon,authenticated;
create function public.list_group_matches(p_group_id uuid,p_season integer default null,p_day_id uuid default null,p_query text default '',p_page integer default 1,p_page_size integer default 5) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.with_draw_results(private.list_group_matches_before_draw(p_group_id,p_season,p_day_id,p_query,p_page,p_page_size));
$$;
revoke all on function public.list_group_matches(uuid,integer,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.list_group_matches(uuid,integer,uuid,text,integer,integer) to authenticated;

alter function public.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) set schema private;
alter function private.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) rename to list_group_period_matches_before_draw;
revoke all on function private.list_group_period_matches_before_draw(uuid,integer,uuid,text,integer,integer,text) from public,anon,authenticated;
create function public.list_group_period_matches(p_group_id uuid,p_season integer default null,p_day_id uuid default null,p_query text default '',p_page integer default 1,p_page_size integer default 5,p_period text default 'all') returns jsonb
language sql stable security definer set search_path='' as $$
  select private.with_draw_results(private.list_group_period_matches_before_draw(p_group_id,p_season,p_day_id,p_query,p_page,p_page_size,p_period));
$$;
revoke all on function public.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.list_group_period_matches(uuid,integer,uuid,text,integer,integer,text) to authenticated;

alter function public.public_player_profile(uuid,text,integer,text,integer,integer) set schema private;
alter function private.public_player_profile(uuid,text,integer,text,integer,integer) rename to public_player_profile_before_draw;
revoke all on function private.public_player_profile_before_draw(uuid,text,integer,text,integer,integer) from public,anon,authenticated;
create function public.public_player_profile(p_group_id uuid,p_player_ref text,p_season integer default null,p_period text default 'all',p_page integer default 1,p_page_size integer default 5) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.with_draw_results(private.public_player_profile_before_draw(p_group_id,p_player_ref,p_season,p_period,p_page,p_page_size));
$$;
revoke all on function public.public_player_profile(uuid,text,integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.public_player_profile(uuid,text,integer,text,integer,integer) to anon,authenticated;

alter function public.public_match_details(uuid,uuid) set schema private;
alter function private.public_match_details(uuid,uuid) rename to public_match_details_before_draw;
revoke all on function private.public_match_details_before_draw(uuid,uuid) from public,anon,authenticated;
create function public.public_match_details(p_group_id uuid,p_match_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.public_match_details_before_draw(p_group_id,p_match_id)||jsonb_build_object('ended_as_draw',
    (select coalesce(snapshot->'ended_as_draw','false'::jsonb) from public.matches where id=p_match_id and group_id=p_group_id and published),
    'draw_interrupted_set',(select snapshot->'draw_interrupted_set' from public.matches where id=p_match_id and group_id=p_group_id and published));
$$;
revoke all on function public.public_match_details(uuid,uuid) from public,anon,authenticated;
grant execute on function public.public_match_details(uuid,uuid) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
