import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('atomic match ingestion runs against PostgreSQL with real constraints and permissions', async t => {
  const database = new PGlite();
  t.after(() => database.close());
  await database.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    revoke all on auth.users from public, anon, authenticated;
  `);
  for (const file of ['20261106000100_groups_and_match_schema.sql', '20261106000200_player_registry_sync.sql', '20261106000300_atomic_match_submission.sql', '20261106000400_public_statistics.sql', '20261106000500_administrative_corrections.sql']) {
    await database.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  }
  const query = (sql, values = []) => database.query(sql, values);
  const [owner, outsider] = [randomUUID(), randomUUID()];
  for (const id of [owner, outsider]) await query('insert into auth.users values ($1,$2,now())', [id, `${id}@example.test`]);
  async function asUser(user, action, role = 'authenticated') {
    await database.exec(`begin; set local role ${role};`);
    try {
      await query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
      const result = await action(); await database.exec('commit'); return result;
    } catch (error) { await database.exec('rollback'); throw error; }
  }
  const group = (await asUser(owner, () => query("select * from public.create_group('Volleyball', 'America/Toronto')"))).rows[0];
  const otherGroup = (await asUser(outsider, () => query("select * from public.create_group('Other', 'UTC')"))).rows[0];
  const players = Array.from({ length: 13 }, (_, i) => ({ id: randomUUID(), name: `Person ${i}` }));
  for (const player of players) await asUser(owner, () => query('select public.sync_group_player($1,$2,$3)', [group.id, player.id, player.name]));
  const foreignId = randomUUID();
  await asUser(outsider, () => query("select public.sync_group_player($1,$2,'Foreign')", [otherGroup.id, foreignId]));
  const oneSet = () => ({ team_a_name: 'Home', team_b_name: 'Away', score_a: 1, score_b: 1,
    rosters: { A: players.slice(0, 6), B: players.slice(6, 12) },
    points: [{ team: 'A', player_id: players[0].id, player_name: 'Historical name', is_opponent_error: false },
      { team: 'B', player_id: null, player_name: null, is_opponent_error: true }],
  });
  const payload = () => ({ format_version: 1, id: randomUUID(), group_id: group.id,
    started_at: '2026-11-06T23:00:00.000Z', closed_at: '2026-11-07T01:00:00.000Z',
    team_a_name: 'Home', team_b_name: 'Away', sets: [oneSet()] });
  async function submit(body, user = owner, role = 'authenticated') {
    return (await asUser(user, () => query('select public.submit_match($1) as result', [body]), role)).rows[0].result;
  }
  async function absent(id) {
    for (const [table, column] of [['matches', 'id'], ['match_sets', 'match_id'], ['set_players', 'match_id'], ['match_points', 'match_id']]) {
      assert.equal((await query(`select count(*)::int as n from public.${table} where ${column}=$1`, [id])).rows[0].n, 0);
    }
    assert.equal((await query('select count(*)::int as n from private.match_metadata where match_id=$1', [id])).rows[0].n, 0);
  }

  await t.test('stores full sets, changing rosters, point authors, errors and derived winners atomically', async () => {
    const body = payload();
    const next = oneSet(); next.rosters = structuredClone(next.rosters);
    next.rosters.A[0] = players[12]; next.score_a = 2;
    next.points = [{ team: 'A', player_id: players[12].id, player_name: players[12].name, is_opponent_error: false }, ...next.points.slice(1),
      { team: 'A', player_id: null, player_name: null, is_opponent_error: true }];
    body.sets.push(next);
    const confirmation = await submit(body);
    assert.equal(confirmation.status, 'saved'); assert.deepEqual(confirmation.submission, body);
    assert.equal(confirmation.version, 1);
    const match = (await query('select * from public.matches where id=$1', [body.id])).rows[0];
    assert.equal(match.sets_a, 1); assert.equal(match.sets_b, 0); // The first tied set grants no victory.
    assert.deepEqual(match.snapshot, body);
    assert.equal((await query('select count(*)::int as n from public.set_players where match_id=$1', [body.id])).rows[0].n, 24);
    const points = (await query('select * from public.match_points where match_id=$1 order by sequence', [body.id])).rows;
    assert.equal(points.length, 5); assert.equal(points[0].player_name, 'Historical name');
    assert.equal(points[2].player_id, players[12].id);
    const metadata = (await query('select * from private.match_metadata where match_id=$1', [body.id])).rows[0];
    assert.equal(metadata.submitted_by, owner); assert.deepEqual(metadata.submission, body);
    assert.equal((await submit(body)).status, 'already_saved');
    assert.equal((await query('select count(*)::int as n from public.match_points where match_id=$1', [body.id])).rows[0].n, 5);
  });

  await t.test('a retry acknowledges the immutable original and never overwrites an admin revision', async () => {
    const body = payload(); await submit(body);
    await query("update public.matches set version=2,sets_a=8,snapshot='{}' where id=$1", [body.id]);
    const retry = await submit(body);
    assert.equal(retry.version, 2); assert.deepEqual(retry.submission, body);
    assert.equal((await query('select sets_a from public.matches where id=$1', [body.id])).rows[0].sets_a, 8);
    const changed = structuredClone(body); changed.team_a_name = 'Changed';
    await assert.rejects(submit(changed), /different submission/);
    assert.equal((await query('select sets_a from public.matches where id=$1', [body.id])).rows[0].sets_a, 8);
  });

  await t.test('all invalid submissions roll back every row, including failures late in the second set', async () => {
    const invalid = [
      body => { body.sets = []; },
      body => { body.started_at = '2027-01-01T00:00:00Z'; },
      body => { body.closed_at = 'infinity'; },
      body => { body.sets[0].score_a = 5; },
      body => { body.sets[0].score_a = -1; },
      body => { body.sets[0].score_a = 1.5; },
      body => { body.sets[0].rosters.A.pop(); },
      body => { body.sets[0].rosters.B[0] = body.sets[0].rosters.A[0]; },
      body => { body.sets[0].rosters.A[0] = { id: foreignId, name: 'Foreign' }; },
      body => { body.sets[0].points[0].player_id = players[6].id; },
      body => { body.sets[0].points[1].player_id = players[0].id; },
      body => { body.sets[0].points[0].player_name = null; },
      body => { body.sets.push(oneSet()); body.sets[1].points[0].player_id = randomUUID(); },
      body => { body.email = 'Never public'; },
      body => { body.sets[0].rosters.A[0].email = 'Never public'; },
      body => { body.sets[0].points[0].private_note = 'Never public'; },
    ];
    for (const mutate of invalid) {
      const body = payload(); body.sets = structuredClone(body.sets); mutate(body);
      await assert.rejects(submit(body)); await absent(body.id);
    }
    const legacy = payload(); legacy.started_at = null;
    assert.equal((await submit(legacy)).status, 'saved');
  });

  await t.test('anonymous, unrelated and revoked users cannot submit or retrieve private submission authors', async () => {
    const body = payload();
    await assert.rejects(submit(body, null, 'anon'), /permission denied/);
    await assert.rejects(submit(body, null), /Only group administrators/);
    await assert.rejects(submit(body, outsider), /Only group administrators/);
    await absent(body.id);
    await asUser(owner, () => query('select public.grant_group_admin($1,$2)', [group.id, `${outsider}@example.test`]));
    await asUser(owner, () => query('select public.revoke_group_admin($1,$2)', [group.id, outsider]));
    await assert.rejects(submit(body, outsider), /Only group administrators/);
    await absent(body.id);
    await submit(body);
    await assert.rejects(submit(body, outsider), /Only group administrators/);
    await assert.rejects(asUser(owner, () => query('select * from private.match_metadata')), /permission denied/);
    await assert.rejects(asUser(owner, () => query('delete from public.matches where id=$1', [body.id])), /permission denied/);
    const visible = (await asUser(null, () => query('select snapshot from public.matches where id=$1', [body.id]), 'anon')).rows[0];
    assert.deepEqual(visible.snapshot, body);
    assert.equal(JSON.stringify(visible).includes('@example.test'), false);
  });
});
