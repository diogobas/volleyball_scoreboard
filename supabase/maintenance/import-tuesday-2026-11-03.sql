-- Run in the Supabase SQL Editor after migrations through 20261108000900.
-- Imports the six screenshot scores and preserves the confirmed substitution as source context.
-- Chicó: Team 2 in sets 1–3, Team 1 in sets 4–6; Carlos made the reverse switch.
-- Per-set rankings credit Chicó 5 points before the switch and 7 afterward (12 total).
-- Whole-match screenshot labels after the switch are not used to assign player totals.
-- Repeat runs leave the existing result unchanged. No players or accounts are created.
begin;
do $$
declare
  target uuid := '653c2c8d-9903-4410-b109-c66320f7300c';
  match_id uuid := '8deb93c2-b213-4a36-9026-e56117c03113';
  game_day uuid; g public.groups; existing public.matches;
  scores jsonb := '[{"score_a":19,"score_b":25,"early_finish":false},{"score_a":22,"score_b":25,"early_finish":false},{"score_a":16,"score_b":25,"early_finish":false},{"score_a":25,"score_b":17,"early_finish":false},{"score_a":25,"score_b":17,"early_finish":false},{"score_a":15,"score_b":12,"early_finish":false}]';
  payload jsonb; outcome jsonb; source_context jsonb;
begin
  select * into strict g from public.groups where id=target for update;
  if g.name is distinct from 'Tuesday Volleyball ‐ 7:30PM-10PM' then
    raise exception 'Expected Tuesday Volleyball group was not found. Nothing was imported.';
  end if;
  select * into existing from public.matches m where m.id=match_id;
  if found then
    if existing.group_id<>target then raise exception 'Import ID is already used by another group.'; end if;
    raise notice 'This import already exists (possibly edited or deleted). Nothing was changed.';
    return;
  end if;
  -- Recognize a result entered manually or imported through another route.
  if exists(select 1 from public.matches m where m.group_id=target and m.published
    and coalesce(m.played_on,(coalesce(m.started_at,m.closed_at) at time zone g.time_zone)::date)=date '2026-11-03'
    and (select jsonb_agg(jsonb_build_array(s.score_a,s.score_b) order by s.set_number) from public.match_sets s where s.match_id=m.id)
      ='[[19,25],[22,25],[16,25],[25,17],[25,17],[15,12]]'::jsonb) then
    raise notice 'These six scores already exist on 2026-11-03. Nothing was changed.';
    return;
  end if;
  payload:=jsonb_build_object('format_version',3,'id',match_id,'group_id',target,'played_on','2026-11-03','rules','recreational',
    'team_a_name','Team 1','team_b_name','Team 2','sets',scores,'players','[]'::jsonb,'errors_a',null,'errors_b',null,'player_totals_recorded',false);
  source_context:=jsonb_build_object(
    'confirmed_by_user','Chicó and Carlos exchanged teams after set 3.',
    'team_changes',jsonb_build_array(
      jsonb_build_object('name','Chicó','from_team','B','to_team','A','after_set',3),
      jsonb_build_object('name','Carlos','from_team','A','to_team','B','after_set',3)),
    'chico_points_from_set_rankings',jsonb_build_array(3,2,0,1,2,4),
    'player_totals_imported',false);
  outcome:=private.match_result(scores);
  insert into private.game_days(group_id,play_date,state) values(target,'2026-11-03','closed') on conflict(group_id,play_date) do nothing;
  select id into strict game_day from private.game_days where group_id=target and play_date='2026-11-03';
  insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,entry_mode,played_on,rules,winner,decided_at,player_totals_recorded)
    values(match_id,target,(timestamp '2026-11-03 12:00' at time zone g.time_zone),(outcome->>'sets_a')::int,(outcome->>'sets_b')::int,
      payload||jsonb_build_object('source',payload),'summary','2026-11-03','recreational',outcome->>'winner',(outcome->>'decided_at')::int,false);
  -- SQL maintenance import: no administrator is impersonated as its author.
  insert into private.match_metadata(match_id,submitted_by,submission) values(match_id,null,payload||jsonb_build_object('import_context',source_context));
  insert into private.day_receipts(id,day_id,submission,draft,decision,submitted_by) values(match_id,game_day,payload,payload,'approved',null);
  insert into public.match_sets(match_id,group_id,set_number,score_a,score_b)
    select match_id,target,n::int,(s->>'score_a')::int,(s->>'score_b')::int from jsonb_array_elements(scores) with ordinality as x(s,n);
  update private.game_days set version=version+1 where id=game_day;
end;
$$;
commit;

-- Verify: six sets, Team 2 wins 0–3, decided in set 3, no individual totals.
select m.id,m.played_on,m.sets_a,m.sets_b,m.winner,m.decided_at,m.player_totals_recorded,s.set_number,s.score_a,s.score_b,
  s.set_number>m.decided_at as training
from public.matches m join public.match_sets s on s.match_id=m.id
where m.group_id='653c2c8d-9903-4410-b109-c66320f7300c' and m.played_on='2026-11-03' and m.published
order by m.id,s.set_number;
