import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, enableCourtMode, matchReducer } from '../src/game/match';
import { applyDayLineup, receivedMatchPayload } from '../src/game/gameDay';

test('season periods filter complete statistics and finalized results cannot be removed', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of (await readdir(new URL('./migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  }
  const q = (sql, args = []) => db.query(sql, args);
  const owner = randomUUID(), outsider = randomUUID();
  for (const id of [owner, outsider]) await q('insert into auth.users values($1,$2,now())', [id, `${id}@test.local`]);
  async function rpc(name, args, user = owner, role = 'authenticated') {
    await db.exec(`begin; set local role ${role};`);
    try {
      await q("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
      const result = await q(`select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})) as data`, args);
      await db.exec('commit'); return result.rows[0].data;
    } catch (error) { await db.exec('rollback'); throw error; }
  }
  const group = await rpc('create_group', ['Season test', 'America/Toronto']);
  const players = Array.from({ length: 12 }, (_, i) => ({ id: randomUUID(), name: `Person ${i}` }));
  for (const player of players) await rpc('save_group_player', [group.id, player.id, player.name, 'fixed', null]);
  const summary = (period, year = 2026, page = 1) => rpc('public_group_period_summary', [group.id, year, page, period], null, 'anon');
  const list = (period, year = 2026, page = 1) => rpc('list_group_period_matches', [group.id, year, null, '', page, 5, period]);
  const dates = ['2026-01-01', '2026-02-28', '2026-03-01', '2026-05-31', '2026-06-01', '2026-08-31', '2026-09-01', '2026-11-30', '2026-12-01', '2025-11-01'];
  const bodies = [];
  for (const played_on of dates) {
    const body = { format_version: 3, id: randomUUID(), group_id: group.id, played_on, rules: 'recreational',
      team_a_name: 'Home', team_b_name: 'Away', player_totals_recorded: true, errors_a: 24, errors_b: 20,
      sets: [{ score_a: 25, score_b: 20, early_finish: false }],
      players: players.map((p, i) => ({ team: i < 6 ? 'A' : 'B', player_id: p.id, name: p.name, points: i === 0 ? 1 : 0 })) };
    await rpc('save_historical_match', [group.id, body, null, 'Register result', randomUUID()]); bodies.push(body);
  }
  await t.test('month boundaries, year and period apply equally to lists, points and attendance', async () => {
    for (const [period, count] of [['winter', 3], ['spring', 2], ['summer', 2], ['fall', 2], ['all', 9]]) {
      const data = await summary(period), matches = await list(period);
      assert.equal(data.period, period); assert.equal(data.match_count, count); assert.equal(data.point_count, count * 45);
      assert.equal(data.attendance_day_count, count); assert.equal(data.players.find(p => p.id === players[0].id).points, count);
      assert.equal(matches.total, count); assert.equal(matches.period, period);
      assert.ok(matches.matches.every(m => data.matches.some(other => other.id === m.id)));
      assert.equal(data.matches.length, count);
    }
    assert.equal((await summary('fall', 2025)).match_count, 1);
    assert.equal((await list('fall', null)).total, 3);
    const first = await list('all'), second = await list('all', 2026, 2);
    assert.equal(new Set([...first.matches, ...second.matches].map(m => m.id)).size, 9);
    assert.equal((await summary('all', 2026, 2)).point_count, 405);
    assert.equal((await summary('fall', 2027)).match_count, 0);
    await assert.rejects(summary('unknown'), /Invalid season period/);
    await assert.rejects(list('unknown'), /Invalid season period/);
    await assert.rejects(rpc('list_group_period_matches', [group.id, 2026, null, '', 1, 5, 'fall'], outsider), /Only group administrators/);
    await assert.rejects(rpc('list_group_period_matches', [group.id, 2026, null, '', 1, 5, 'fall'], null, 'anon'), /permission denied/);
  });
  await t.test('historical deletion fails while corrections stay available', async () => {
    const body = bodies[0], before = await summary('all');
    const current = await rpc('get_historical_match', [group.id, body.id]);
    await assert.rejects(rpc('delete_final_match', [group.id, body.id, current.version, 'Delete']), /Finalized matches cannot be deleted/);
    await assert.rejects(rpc('delete_final_match', [group.id, body.id, current.version, 'Delete'], outsider), /Only group administrators/);
    const updated = { ...current.payload, team_a_name: 'Corrected name' };
    await rpc('save_historical_match', [group.id, updated, current.version, 'Correct name', randomUUID()]);
    assert.equal((await rpc('public_match_details', [group.id, body.id], null, 'anon')).team_a_name, 'Corrected name');
    assert.equal((await summary('all')).point_count, before.point_count);
  });
  await t.test('day deletion cannot remove synced results; empty days can still be deleted', async () => {
    const lineup = { A: { name: 'Home', players: players.slice(0, 6) }, B: { name: 'Away', players: players.slice(6) } };
    const created = await rpc('create_game_day', [group.id, '2026-11-09', lineup]);
    const context = { ...await rpc('redeem_day_code', [created.code], null, 'anon'), code: created.code };
    let state = applyDayLineup(enableCourtMode(createMatch()), context);
    state = matchReducer(state, { type: 'point', team: 'A', playerId: 'p1', startedAt: '2026-11-09T23:00:00Z' });
    state = matchReducer(state, { type: 'closeSet' });
    const source = receivedMatchPayload({ id: randomUUID(), formatVersion: 1, closedAt: '2026-11-09T23:10:00Z', state });
    await rpc('receive_day_match', [created.code, source], null, 'anon');
    const day = await rpc('get_game_day', [created.day.id]);
    await assert.rejects(rpc('delete_game_day', [group.id, created.day.id, day.day.version, 'Delete']), /finalized matches cannot be deleted/);
    await assert.rejects(rpc('review_day_match', [source.id, 1, 'excluded', null, 'Delete', randomUUID()]), /Finalized matches cannot be deleted/);
    assert.equal((await rpc('public_match_details', [group.id, source.id], null, 'anon')).id, source.id);
    assert.equal((await rpc('get_game_day', [created.day.id])).receipts.length, 1);
    assert.equal((await q('select count(*)::int n from public.match_points where match_id=$1', [source.id])).rows[0].n, 1);
    const dayCount = (await rpc('list_game_days', [group.id])).length;
    const empty = await rpc('create_game_day', [group.id, '2026-11-10', lineup]);
    await rpc('delete_game_day', [group.id, empty.day.id, empty.day.version, 'Empty day']);
    assert.equal((await rpc('list_game_days', [group.id])).length, dayCount);
  });
});
