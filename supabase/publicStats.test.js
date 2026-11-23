import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, matchReducer, matchRoster } from '../src/game/match';
import { assignMatchPlayers } from '../src/game/registry';
import { seasonStatistics } from '../src/game/seasons';
import { matchPayload } from '../src/remote/matchPayload';

test('anonymous public statistics use confirmed relational data and match the approved rules', async t => {
  const database = new PGlite(); t.after(() => database.close());
  await database.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;
  `);
  for (const file of ['20261106000100_groups_and_match_schema.sql','20261106000200_player_registry_sync.sql','20261106000300_atomic_match_submission.sql','20261106000400_public_statistics.sql']) {
    await database.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  }
  const query = (sql, args = []) => database.query(sql, args);
  const [owner, outsider] = [randomUUID(), randomUUID()];
  for (const id of [owner, outsider]) await query('insert into auth.users values($1,$2,now())', [id, `${id}@example.test`]);
  async function role(user, action, name = 'authenticated') {
    await database.exec(`begin; set local role ${name};`);
    try {
      await query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
      const result = await action(); await database.exec('commit'); return result;
    } catch (error) { await database.exec('rollback'); throw error; }
  }
  const anon = action => role(null, action, 'anon');
  const group = (await role(owner, () => query("select * from public.create_group('Tuesday Volleyball','America/Toronto')"))).rows[0];
  const other = (await role(outsider, () => query("select * from public.create_group('Other group','UTC')"))).rows[0];
  const players = Array.from({ length: 13 }, (_, i) => ({ id: randomUUID(), groupId: group.id, name: `Person ${i}` }));
  for (const player of players) await role(owner, () => query('select public.sync_group_player($1,$2,$3)', [group.id, player.id, player.name]));

  function game(start, { draw = false, swaps = false, unused = false } = {}) {
    const state = createMatch(); const teams = structuredClone(state.teams);
    for (const [index, team] of ['A','B'].entries()) for (let i = 0; i < 6; i++) teams[team].players[i].personId = players[index * 6 + i].id;
    let match = assignMatchPlayers(state, group.id, teams, players);
    const point = (team, playerId) => { match = matchReducer(match, { type: 'point', team, playerId, startedAt: start }); };
    point('A','p1'); if (!draw) point('A','p1'); point('B','err');
    match = matchReducer(match, { type: 'closeSet' });
    if (swaps) {
      const rosters = matchRoster(match);
      [rosters.A[0],rosters.B[0]] = [rosters.B[0],rosters.A[0]];
      match = matchReducer(match, { type: 'roster', rosters });
      point('A','p1'); match = matchReducer(match, { type: 'closeSet' });
    }
    if (unused) {
      const rosters = matchRoster(match); rosters.A[0] = { id: 'p1', personId: players[12].id, name: players[12].name };
      match = matchReducer(match, { type: 'roster', rosters });
    }
    return { id: randomUUID(), formatVersion: 1, closedAt: new Date(Date.parse(start) + 600_000).toISOString(), state: match };
  }
  const matches = [game('2026-01-02T01:00:00Z'), game('2026-01-02T02:00:00Z', { draw: true }),
    game('2026-01-03T02:00:00Z', { swaps: true, unused: true }), game('2026-01-01T02:00:00Z'), game('2026-01-04T01:00:00Z')];
  delete matches[4].state.startedAt;
  for (const match of matches) await role(owner, () => query('select public.submit_match($1)', [matchPayload(match)]));
  const summary = async (season = 2026, page = 1, id = group.id) => (await anon(() => query('select public.public_group_summary($1,$2,$3) as data', [id,season,page]))).rows[0].data;
  const details = async (id, groupId = group.id) => (await anon(() => query('select public.public_match_details($1,$2) as data', [groupId,id]))).rows[0].data;

  await t.test('server totals agree with local rules for zero-point participation, same-day attendance, draws and both teams', async () => {
    const data = await summary();
    const expected = seasonStatistics(matches, { id: group.id, timeZone: group.time_zone }, players, 2026);
    assert.equal(data.match_count, expected.includedMatches); assert.equal(data.match_count, 4);
    assert.equal(data.fallback_dates, 1); assert.equal(data.participant_count, 12);
    // This suite pins migration 004. Current first-to-three win parity is covered by historicalMatches.test.js.
    for (const row of expected.rows) {
      const actual = data.players.find(player => player.id === row.personId);
      for (const field of ['points','matches','days']) assert.equal(actual[field], row[field], `${row.name} ${field}`);
    }
    assert.equal(data.players.find(player => player.id === players[0].id).wins, 2);
    assert.equal(data.players.find(player => player.id === players[1].id).points, 0);
    assert.equal(data.players.find(player => player.id === players[1].id).wins, 3);
    assert.equal(data.players.find(player => player.id === players[12].id).matches, 0);
    assert.equal((await summary(2025)).match_count, 1); // Jan 1 UTC belongs to Dec 31 in Toronto.
    assert.equal(data.players.find(player => player.id === players[0].id).days, 3);
    const draft = game('2026-01-05T01:00:00Z'); assert.ok(draft.state.groupId);
    assert.equal((await summary()).match_count, 4); // An unsubmitted local draft has no effect.
  });

  await t.test('match details preserve each set lineup, historical names, points and opponent errors', async () => {
    const data = await details(matches[2].id);
    assert.equal(data.group.id, group.id); assert.equal(data.sets.length, 2);
    assert.equal(data.sets[0].players.length, 12);
    assert.equal(data.sets[0].players.find(p => p.id === players[0].id).team, 'A');
    assert.equal(data.sets[1].players.find(p => p.id === players[0].id).team, 'B');
    assert.equal(data.sets[0].players.find(p => p.id === players[0].id).points, 2);
    assert.equal(data.sets[1].players.find(p => p.id === players[6].id).points, 1);
    assert.equal(data.sets[0].errors_b, 1); assert.equal(data.sets[0].errors_a, 0);
    assert.equal(data.sets_a, 2); assert.equal(data.sets_b, 0);
    await query("update public.players set name='Renamed registration' where id=$1", [players[0].id]);
    assert.equal((await summary()).players.find(p => p.id === players[0].id).name, 'Renamed registration');
    assert.equal((await details(matches[2].id)).sets[0].players.find(p => p.id === players[0].id).name, players[0].name);
  });

  await t.test('pagination does not truncate season totals or duplicate matches and stays within the group', async () => {
    for (let i = 0; i < 26; i++) {
      const match = game(`2024-06-${String(i + 1).padStart(2,'0')}T20:00:00Z`);
      await role(owner, () => query('select public.submit_match($1)', [matchPayload(match)]));
    }
    const first = await summary(2024,1); const second = await summary(2024,2);
    assert.equal(first.matches.length, 25); assert.equal(second.matches.length, 1);
    assert.equal(first.match_count, 26); assert.equal(second.match_count, 26);
    assert.equal(new Set([...first.matches,...second.matches].map(m => m.id)).size, 26);
    assert.deepEqual(first.players, second.players); assert.equal(first.players.find(p => p.id === players[1].id).matches, 26);
    assert.equal((await summary(2024,1,other.id)).match_count, 0);
    await assert.rejects(details(matches[0].id,other.id), /not found in this group/);
    assert.equal((await summary(2024,3)).matches.length, 0);
  });

  await t.test('anonymous reads expose no administrative identities and cannot mutate results', async () => {
    const data = JSON.stringify({ summary: await summary(), details: await details(matches[0].id) });
    for (const secret of [owner,outsider,'@example.test','submitted_by','submission','group_admins']) assert.equal(data.includes(secret), false);
    for (const table of ['private.group_admins','private.match_metadata','private.match_revisions','auth.users']) {
      await assert.rejects(anon(() => query(`select * from ${table}`)), /permission denied/);
    }
    await assert.rejects(anon(() => query('delete from public.matches')), /permission denied/);
    await assert.rejects(anon(() => query('select public.submit_match($1)', [matchPayload(matches[0])])), /permission denied/);
    await assert.rejects(summary(0), /Invalid season/); await assert.rejects(summary(2026,0), /Invalid season/);
    await assert.rejects(summary(2026,1,randomUUID()), /Group not found/);
    const empty = await summary(2020); assert.equal(empty.match_count, 0); assert.equal(empty.matches.length, 0);
    const current = await summary(null); assert.ok(current.seasons.includes(current.season));
    const functions = await query("select p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('public_group_summary','public_match_details')");
    assert.ok(functions.rows.every(fn => !fn.prosecdef && fn.proconfig.some(value => value.startsWith('search_path='))));
  });
});
