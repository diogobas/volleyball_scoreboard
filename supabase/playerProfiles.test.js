import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = '20261109000300_player_profiles_and_statistics.sql';
test('player profiles preserve identity, validate metadata and report only scoped published participation', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of (await readdir(new URL('./migrations/', import.meta.url))).filter(file => file.endsWith('.sql') && file < migration).sort()) await db.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  const q = (sql, args = []) => db.query(sql, args);
  const owner = randomUUID(), communityAdmin = randomUUID(), outsider = randomUUID();
  for (const [id, email] of [[owner, 'group@test.local'], [communityAdmin, 'community@test.local'], [outsider, 'outsider@test.local']]) await q('insert into auth.users values($1,$2,now())', [id, email]);
  async function as(user, action, role = 'authenticated') {
    await db.exec(`begin;set local role ${role};`);
    try { await q("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']); const result = await action(); await db.exec('commit'); return result; }
    catch (error) { await db.exec('rollback'); throw error; }
  }
  const rpc = (name, args = [], user = owner, role = 'authenticated') => as(user, () => q(`select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})) as data`, args), role).then(r => r.rows[0]?.data);
  const c = await rpc('create_community', ['Profile community', 'Montreal'], communityAdmin);
  const group = await rpc('create_community_group', [c.id, 'Profile group', 'America/Toronto'], communityAdmin);
  await rpc('grant_group_admin', [group.id, 'group@test.local'], communityAdmin);
  const sibling = await rpc('create_community_group', [c.id, 'Sibling', 'America/Toronto'], communityAdmin);
  const people = [];
  for (let i = 0; i < 12; i++) people.push(await rpc('save_group_player', [group.id, randomUUID(), `Person ${i + 1}`, 'fixed', null]));
  await db.exec(await readFile(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
  const player = people[0];
  const save = (body, version = player.version, user = owner) => rpc('save_group_player_profile', [group.id, player.id, body.name ?? player.name, body.category ?? 'fixed', body.sex ?? null, body.positions ?? [], version], user);
  const profile = (id = player.id, season = 2026, period = 'fall', page = 1, size = 5, groupId = group.id) => rpc('public_player_profile', [groupId, id, season, period, page, size], null, 'anon');
  await t.test('existing registrations get unspecified attributes; profile saves are versioned, atomic and retry-safe', async () => {
    let current = (await rpc('get_group_registry', [group.id])).players.find(row => row.id === player.id);
    assert.equal(current.sex, null); assert.deepEqual(current.preferred_positions, []); assert.equal(current.version, player.version);
    const saved = await save({ sex: 'female', positions: ['LB', 'S', 'OH'] });
    assert.equal(saved.version, player.version + 1); assert.deepEqual(saved.preferred_positions, ['S', 'OH', 'LB']);
    assert.equal((await save({ sex: 'female', positions: ['OH', 'S', 'LB'] })).version, saved.version);
    await assert.rejects(save({ sex: 'male', positions: ['MB'] }), /changed/);
    for (const positions of [['X'], ['S', 'S'], [null]]) await assert.rejects(save({ positions }, saved.version), /valid sex and preferred positions/);
    await assert.rejects(save({ sex: 'invalid' }, saved.version), /valid sex/);
    await assert.rejects(save({ sex: 'male' }, saved.version, outsider), /Only group administrators/);
    await assert.rejects(rpc('save_group_player_profile', [group.id, player.id, player.name, 'fixed', null, [], saved.version], null, 'anon'), /permission denied/);
    await assert.rejects(rpc('save_group_player_profile', [sibling.id, player.id, player.name, 'fixed', null, [], saved.version], communityAdmin), /another group/);
    // A legacy name/category save cannot clear new profile attributes.
    current = await rpc('save_group_player', [group.id, player.id, 'Renamed player', 'sub', saved.version]);
    assert.equal(current.sex, 'female'); assert.deepEqual(current.preferred_positions, ['S', 'OH', 'LB']);
    const cleared = await save({ name: 'Renamed player', category: 'sub', sex: null, positions: [] }, current.version);
    assert.equal(cleared.sex, null); assert.deepEqual(cleared.preferred_positions, []);
    const communityEdit = await save({ name: 'Renamed player', category: 'sub', sex: 'male', positions: ['O', 'MB'] }, cleared.version, communityAdmin);
    assert.equal(communityEdit.sex, 'male'); assert.deepEqual(communityEdit.preferred_positions, ['MB', 'O']);
  });
  await t.test('reusing a community player copies profile attributes without allowing group edits to modify sibling profiles', async () => {
    const current = (await rpc('get_group_registry', [group.id])).players.find(row => row.id === player.id);
    await rpc('import_community_players', [sibling.id, [current.community_person_id], 'fixed'], communityAdmin);
    const imported = (await rpc('get_group_registry', [sibling.id], communityAdmin)).players[0];
    assert.equal(imported.sex, 'male'); assert.deepEqual(imported.preferred_positions, ['MB', 'O']);
    await save({ name: 'Renamed player', category: 'sub', sex: 'female', positions: ['S'] }, current.version);
    const after = (await rpc('get_group_registry', [sibling.id], communityAdmin)).players[0];
    assert.equal(after.sex, 'male'); assert.deepEqual(after.preferred_positions, ['MB', 'O']);
    await assert.rejects(rpc('save_group_player_profile', [sibling.id, imported.id, imported.name, 'fixed', null, [], imported.version]), /Only group administrators/);
  });
  function historical({ date = '2026-11-03', points = 7, withPlayer = true, unknown = false, win = true, bothTeams = false } = {}) {
    const scores = win ? [[25, 20], [25, 20], [25, 20], [20, 25]] : [[20, 25], [20, 25], [20, 25]];
    const roster = people.map((person, i) => ({ team: i < 6 ? 'A' : 'B', player_id: person.id, name: person.name, points: i === 0 && withPlayer ? points : 0 }));
    if (!withPlayer) roster[0] = { ...roster[0], player_id: null, name: 'Other person', points: 0 };
    if (bothTeams) { roster[0].result_team = null; roster[0].points = points - 2; roster.push({ ...roster[0], team: 'B', points: 2 }); }
    return { format_version: 3, id: randomUUID(), group_id: group.id, played_on: date, rules: 'recreational', team_a_name: 'Home', team_b_name: 'Away',
      player_totals_recorded: !unknown, players: unknown ? [] : roster, errors_a: unknown ? null : scores.reduce((sum, set) => sum + set[0], 0) - (withPlayer ? points - (bothTeams ? 2 : 0) : 0),
      errors_b: unknown ? null : scores.reduce((sum, set) => sum + set[1], 0) - (bothTeams ? 2 : 0), sets: scores.map(([score_a, score_b]) => ({ score_a, score_b, early_finish: false })) };
  }
  const record = body => rpc('save_historical_match', [group.id, body, null, 'Historical result', randomUUID()]);
  await t.test('player statistics agree with season totals and include only their matches, across pagination and date filters', async () => {
    people[0] = (await rpc('get_group_registry', [group.id])).players.find(row => row.id === player.id);
    await record(historical()); await record(historical({ points: 0 }));
    await record(historical({ date: '2026-11-04', points: 4, win: false }));
    await record(historical({ date: '2026-11-05', points: 5, bothTeams: true }));
    await record(historical({ date: '2026-11-06', withPlayer: false }));
    await record(historical({ date: '2026-11-07', unknown: true }));
    await record(historical({ date: '2026-05-03', points: 8 }));
    await record(historical({ date: '2025-11-03', points: 9 }));
    const data = await profile();
    assert.equal(data.player.id, player.id); assert.equal(data.player.sex, 'female'); assert.deepEqual(data.player.preferred_positions, ['S']);
    assert.deepEqual(data.statistics, { points: 16, matches: 4, wins: 2, days: 3, attendance_day_count: 4 });
    assert.equal(data.match_count, 4); assert.equal(data.matches.reduce((sum, m) => sum + m.player_points, 0), 16);
    assert.equal(data.matches.filter(m => m.player_result === 'win').length, 2); assert.equal(data.matches.filter(m => m.player_result === 'unassigned').length, 1);
    const summary = await rpc('public_group_period_summary', [group.id, 2026, 1, 'fall'], null, 'anon');
    const row = summary.players.find(p => p.id === player.id);
    for (const field of ['points', 'matches', 'wins', 'days']) assert.equal(data.statistics[field], row[field]);
    assert.equal((await profile(player.display_id)).player.id, player.id);
    assert.equal((await profile(player.id, 2026, 'spring')).statistics.points, 8);
    assert.equal((await profile(player.id, 2025)).statistics.points, 9);
    assert.equal((await profile(player.id, 2027)).statistics.matches, 0);
    for (let i = 0; i < 4; i++) await record(historical({ date: '2026-11-08', points: 1 }));
    const first = await profile(), second = await profile(player.id, 2026, 'fall', 2);
    assert.equal(first.match_count, 8); assert.equal(first.matches.length, 5); assert.equal(second.matches.length, 3);
    assert.deepEqual(first.statistics, second.statistics); assert.equal(new Set([...first.matches, ...second.matches].map(m => m.id)).size, 8);
    assert.equal(first.statistics.points, 20); assert.equal(first.statistics.attendance_day_count, 5);
  });
  await t.test('live competitive team changes and training points agree with group statistics', async () => {
    const liveGroup = await rpc('create_community_group', [c.id, 'Live statistics', 'America/Toronto'], communityAdmin);
    const livePeople = [];
    for (let i = 0; i < 13; i++) livePeople.push(await rpc('save_group_player', [liveGroup.id, randomUUID(), `Live ${i + 1}`, 'fixed', null], communityAdmin));
    const base = { A: livePeople.slice(0, 6).map(p => ({ id: p.id, name: p.name })), B: livePeople.slice(6, 12).map(p => ({ id: p.id, name: p.name })) };
    const sets = [];
    for (let i = 0; i < 5; i++) {
      const rosters = structuredClone(base);
      if (i === 1) [rosters.A[0], rosters.B[0]] = [rosters.B[0], rosters.A[0]];
      if (i === 4) { rosters.A[0] = { id: livePeople[12].id, name: livePeople[12].name }; rosters.B[0] = base.A[0]; }
      const team = i === 1 ? 'B' : 'A';
      const scorer = i === 4 ? livePeople[12] : livePeople[0];
      const points = [{ team, player_id: scorer.id, player_name: scorer.name, is_opponent_error: false }];
      if (i === 4) points.push({ team: 'B', player_id: livePeople[0].id, player_name: livePeople[0].name, is_opponent_error: false });
      sets.push({ team_a_name: 'Home', team_b_name: 'Away', score_a: team === 'A' ? 1 : 0, score_b: team === 'B' || i === 4 ? 1 : 0, rosters, points });
    }
    await rpc('submit_match', [{ format_version: 1, id: randomUUID(), group_id: liveGroup.id, started_at: '2026-11-10T23:00:00Z', closed_at: '2026-11-11T01:00:00Z', team_a_name: 'Home', team_b_name: 'Away', sets }], communityAdmin);
    const mixed = await profile(livePeople[0].id, 2026, 'fall', 1, 5, liveGroup.id);
    assert.equal(mixed.statistics.points, 5); assert.equal(mixed.statistics.wins, 0); assert.equal(mixed.matches[0].player_result, 'mixed');
    const training = await profile(livePeople[12].id, 2026, 'fall', 1, 5, liveGroup.id);
    assert.equal(training.statistics.points, 1); assert.equal(training.statistics.matches, 1); assert.equal(training.statistics.wins, 0); assert.equal(training.matches[0].player_result, 'training');
    const summary = await rpc('public_group_period_summary', [liveGroup.id, 2026, 1, 'fall'], null, 'anon');
    for (const data of [mixed, training]) {
      const row = summary.players.find(p => p.id === data.player.id);
      for (const field of ['points', 'matches', 'wins', 'days']) assert.equal(data.statistics[field], row[field]);
    }
  });
  await t.test('scope, metadata validation, unpublished matches and removed registrations stay protected', async () => {
    await assert.rejects(profile(player.id, 2026, 'fall', 1, 5, sibling.id), /Player not found in this group/);
    await assert.rejects(profile(randomUUID()), /Player not found/);
    await assert.rejects(profile(player.id, 2026, 'bad'), /Invalid season period/);
    await assert.rejects(profile(player.id, 2026, 'all', 0), /Invalid player match page/);
    await assert.rejects(profile(player.id, 2026, 'all', 1, 100), /Invalid player match page/);
    await assert.rejects(as(null, () => q('select * from public.players'), 'anon'), /permission denied/);
    const id = randomUUID();
    await q("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,published,played_on,entry_mode) values($1,$2,now(),1,0,'{}',false,'2026-11-09','summary')", [id, group.id]);
    await q("insert into public.match_player_totals(match_id,group_id,team,player_id,player_name,points,result_team) values($1,$2,'A',$3,$4,999,'A')", [id, group.id, player.id, player.name]);
    const before = await profile(); assert.equal(before.statistics.points, 20);
    const unused = await rpc('save_group_player_profile', [group.id, randomUUID(), 'Unused removed', 'sub', null, [], null]);
    await rpc('delete_group_player', [group.id, unused.id, unused.version]); await assert.rejects(profile(unused.id), /Player not found/);
    const current = (await rpc('get_group_registry', [group.id])).players.find(p => p.id === player.id);
    await rpc('delete_group_player', [group.id, player.id, current.version]);
    const archived = await profile(); assert.equal(archived.player.removed, true); assert.deepEqual(archived.statistics, before.statistics);
  });
});
