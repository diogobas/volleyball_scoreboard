import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('Supabase schema and access controls run against PostgreSQL', async t => {
  const database = new PGlite();
  t.after(() => database.close());
  // Only the Supabase-owned Auth surface is stubbed. Tables, constraints, grants,
  // functions, roles and RLS below execute in a real PostgreSQL engine.
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
  await database.exec(await readFile(new URL('./migrations/20261106000100_groups_and_match_schema.sql', import.meta.url), 'utf8'));
  const [a, b, c, unconfirmed] = Array.from({ length: 4 }, () => randomUUID());
  for (const [id, email, confirmed] of [[a, 'a@example.test', true], [b, 'b@example.test', true], [c, 'c@example.test', true], [unconfirmed, 'pending@example.test', false]]) {
    await database.query('insert into auth.users values ($1,$2,$3)', [id, email, confirmed ? '2026-11-06T12:00:00Z' : null]);
  }
  async function asUser(user, action, role = 'authenticated') {
    await database.exec(`begin; set local role ${role};`);
    try {
      await database.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
      const result = await action();
      await database.exec('commit');
      return result;
    } catch (error) { await database.exec('rollback'); throw error; }
  }
  const query = (sql, values = []) => database.query(sql, values);
  const groupA = (await asUser(a, () => query("select * from public.create_group('  Group   A ', 'America/Toronto')"))).rows[0];
  const groupB = (await asUser(b, () => query("select * from public.create_group('Group B', 'UTC')"))).rows[0];
  const playerA = randomUUID();
  const playerB = randomUUID();

  await t.test('group creation atomically authorizes its creator and only their groups are returned', async () => {
    assert.equal(groupA.name, 'Group A');
    assert.deepEqual((await asUser(a, () => query('select id from public.list_my_groups()'))).rows, [{ id: groupA.id }]);
    assert.deepEqual((await asUser(b, () => query('select id from public.list_my_groups()'))).rows, [{ id: groupB.id }]);
    assert.deepEqual((await asUser(c, () => query('select id from public.list_my_groups()'))).rows, []);
    assert.equal((await asUser(a, () => query('select * from public.list_group_admins($1)', [groupA.id]))).rows[0].email, 'a@example.test');
  });

  await t.test('anonymous, missing identity, unconfirmed users and invalid input cannot create groups', async () => {
    await assert.rejects(asUser(null, () => query("select * from public.create_group('No', 'UTC')"), 'anon'), /permission denied/);
    await assert.rejects(asUser(null, () => query("select * from public.create_group('No', 'UTC')")), /confirmed email/);
    await assert.rejects(asUser(unconfirmed, () => query("select * from public.create_group('No', 'UTC')")), /confirmed email/);
    await assert.rejects(asUser(a, () => query("select * from public.create_group(' ', 'UTC')")), /group name/);
    await assert.rejects(asUser(a, () => query("select * from public.create_group('Invalid', 'Not/AZone')")), /time zone/);
    assert.equal((await query('select count(*)::int as n from public.groups')).rows[0].n, 2);
    assert.equal((await query('select count(*)::int as n from private.group_admins')).rows[0].n, 2);
  });

  await t.test('only the group admin can insert/update players; normalized names and identity are enforced', async () => {
    await asUser(a, () => query('insert into public.players(id,group_id,name) values ($1,$2,$3)', [playerA, groupA.id, 'João   Silva']));
    await assert.rejects(asUser(c, () => query('insert into public.players(group_id,name) values ($1,$2)', [groupA.id, 'Unauthorized'])), /row-level security/);
    await assert.rejects(asUser(b, () => query('insert into public.players(group_id,name) values ($1,$2)', [groupA.id, 'Wrong group'])), /row-level security/);
    await asUser(b, () => query('insert into public.players(id,group_id,name) values ($1,$2,$3)', [playerB, groupB.id, 'João Silva']));
    await assert.rejects(asUser(a, () => query('insert into public.players(group_id,name) values ($1,$2)', [groupA.id, 'joao silva'])), /unique constraint/);
    assert.equal((await asUser(c, () => query("update public.players set name='Stolen' where id=$1 returning id", [playerA]))).rows.length, 0);
    await asUser(a, () => query("update public.players set name='João Silva' where id=$1", [playerA]));
    await assert.rejects(query('update public.players set group_id=$1 where id=$2', [groupB.id, playerA]), /cannot be changed/);
  });

  await t.test('admin authorization checks membership before email lookup and only accepts confirmed accounts', async () => {
    await assert.rejects(asUser(c, () => query('select public.grant_group_admin($1,$2)', [groupA.id, 'missing@example.test'])), /Only group administrators/);
    await assert.rejects(asUser(a, () => query('select public.grant_group_admin($1,$2)', [groupA.id, 'pending@example.test'])), /no confirmed account/);
    await asUser(a, () => query('select public.grant_group_admin($1,$2)', [groupA.id, ' C@EXAMPLE.TEST ']));
    await asUser(a, () => query('select public.grant_group_admin($1,$2)', [groupA.id, 'c@example.test']));
    assert.deepEqual((await asUser(c, () => query('select id from public.list_my_groups()'))).rows, [{ id: groupA.id }]);
    assert.equal((await asUser(c, () => query('select * from public.list_group_admins($1)', [groupA.id]))).rows.length, 2);
    await assert.rejects(asUser(b, () => query('select * from public.list_group_admins($1)', [groupA.id])), /Only group administrators/);
    await assert.rejects(asUser(c, () => query('select public.grant_group_admin($1,$2)', [groupB.id, 'a@example.test'])), /Only group administrators/);
  });

  await t.test('revocation takes effect immediately and cannot remove the last administrator', async () => {
    await asUser(a, () => query('select public.revoke_group_admin($1,$2)', [groupA.id, c]));
    assert.deepEqual((await asUser(c, () => query('select id from public.list_my_groups()'))).rows, []);
    await assert.rejects(asUser(c, () => query('select public.grant_group_admin($1,$2)', [groupA.id, 'b@example.test'])), /Only group administrators/);
    await assert.rejects(asUser(a, () => query('select public.revoke_group_admin($1,$2)', [groupA.id, a])), /at least one/);
  });

  await t.test('private administrative rows and Auth emails cannot be queried directly, even by an admin', async () => {
    for (const table of ['private.group_admins', 'private.match_metadata', 'private.match_revisions', 'auth.users']) {
      await assert.rejects(asUser(a, () => query(`select * from ${table}`)), /permission denied/);
      await assert.rejects(asUser(null, () => query(`select * from ${table}`), 'anon'), /permission denied/);
    }
    await assert.rejects(asUser(c, () => query('insert into private.group_admins(group_id,user_id,added_by) values ($1,$2,$2)', [groupA.id, c])), /permission denied/);
    await assert.rejects(asUser(null, () => query('select * from public.list_group_admins($1)', [groupA.id]), 'anon'), /permission denied/);
  });

  const matchId = randomUUID();
  await t.test('match constraints prevent cross-group lineups, duplicated players and points by the wrong team', async () => {
    await query("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values ($1,$2,now(),1,0,'{}')", [matchId, groupA.id]);
    await query('insert into public.match_sets values ($1,$2,1,1,0)', [matchId, groupA.id]);
    await query("insert into public.set_players values ($1,$2,1,'A',1,$3,'João Silva')", [matchId, groupA.id, playerA]);
    await assert.rejects(query("insert into public.set_players values ($1,$2,1,'B',1,$3,'Other')", [matchId, groupA.id, playerB]), /foreign key/);
    await assert.rejects(query("insert into public.set_players values ($1,$2,1,'B',1,$3,'Duplicate')", [matchId, groupA.id, playerA]), /unique constraint/);
    await assert.rejects(query("insert into public.match_points values ($1,$2,1,1,'B',$3,'Wrong team',false)", [matchId, groupA.id, playerA]), /foreign key/);
    await assert.rejects(query("insert into public.match_points values ($1,$2,1,1,'A',$3,null,false)", [matchId, groupA.id, playerA]), /check constraint/);
    await query("insert into public.match_points values ($1,$2,1,1,'A',$3,'João Silva',false)", [matchId, groupA.id, playerA]);
    await query("insert into public.match_points values ($1,$2,2,1,'A',null,null,true)", [matchId, groupA.id]);
  });

  await t.test('public reads expose results but no authors or emails; direct match writes stay closed until ingestion RPC', async () => {
    const visible = await asUser(null, () => query('select * from public.matches'), 'anon');
    assert.equal(visible.rows[0].id, matchId);
    assert.equal('submitted_by' in visible.rows[0], false);
    assert.equal('email' in visible.rows[0], false);
    assert.equal((await asUser(null, () => query('select * from public.players'), 'anon')).rows.length, 2);
    await assert.rejects(asUser(a, () => query("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values ($1,$2,now(),1,0,'{}')", [randomUUID(), groupA.id])), /permission denied/);
    await assert.rejects(asUser(a, () => query("insert into public.groups(name,time_zone) values ('Bypass','UTC')")), /permission denied/);
    await assert.rejects(asUser(null, () => query('select public.grant_group_admin($1,$2)', [groupA.id, 'b@example.test']), 'anon'), /permission denied/);
  });

  await t.test('every application table enables RLS and privileged RPCs pin their search path', async () => {
    const tables = await query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'");
    assert.equal(tables.rows.length, 9);
    assert.ok(tables.rows.every(table => table.relrowsecurity));
    const functions = await query("select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef");
    assert.equal(functions.rows.length, 6);
    assert.ok(functions.rows.every(fn => fn.proconfig?.some(config => config.startsWith('search_path='))));
  });

  await database.exec(await readFile(new URL('./migrations/20261106000200_player_registry_sync.sql', import.meta.url), 'utf8'));
  const syncPlayer = (actor, id, name, target = groupA.id) => asUser(actor, () => query('select public.sync_group_player($1,$2,$3) as result', [target, id, name]));
  const registeredId = randomUUID();

  await t.test('registry RPC preserves caller UUID, accepts retries and never merges another ID by name', async () => {
    const first = (await syncPlayer(a, registeredId, ' Ana  Costa ')).rows[0].result;
    assert.equal(first.status, 'saved');
    assert.equal(first.player.id, registeredId);
    assert.equal(first.player.name, 'Ana Costa');
    assert.equal((await syncPlayer(a, registeredId, 'ÁNA COSTA')).rows[0].result.status, 'saved');
    const anotherId = randomUUID();
    const conflict = (await syncPlayer(a, anotherId, 'ana costa')).rows[0].result;
    assert.equal(conflict.status, 'name_conflict');
    assert.equal(conflict.player.id, registeredId);
    assert.equal((await query('select count(*)::int as n from public.players where id=$1', [anotherId])).rows[0].n, 0);
    assert.equal((await syncPlayer(a, anotherId, 'Ana')).rows[0].result.status, 'name_conflict');
    assert.equal((await syncPlayer(a, anotherId, 'Ana Silva')).rows[0].result.status, 'saved');
    assert.equal((await syncPlayer(a, registeredId, 'Another person')).rows[0].result.status, 'identity_conflict');
    assert.equal((await query('select name from public.players where id=$1', [registeredId])).rows[0].name, 'Ana Costa');
  });

  await t.test('registry snapshots are restricted to current administrators and contain only one group', async () => {
    const snapshot = (await asUser(a, () => query('select public.get_group_registry($1) as result', [groupA.id]))).rows[0].result;
    assert.equal(snapshot.group.id, groupA.id);
    assert.ok(snapshot.players.every(player => player.group_id === groupA.id));
    assert.equal(JSON.stringify(snapshot).includes('@example.test'), false);
    await assert.rejects(asUser(b, () => query('select public.get_group_registry($1)', [groupA.id])), /Only group administrators/);
    await assert.rejects(asUser(c, () => query('select public.get_group_registry($1)', [groupA.id])), /Only group administrators/);
    await assert.rejects(asUser(null, () => query('select public.get_group_registry($1)', [groupA.id]), 'anon'), /permission denied/);
    await assert.rejects(syncPlayer(b, randomUUID(), 'Not authorized'), /Only group administrators/);
    await assert.rejects(syncPlayer(c, randomUUID(), 'Revoked administrator'), /Only group administrators/);
    await assert.rejects(syncPlayer(a, playerB, 'Cross-group ID'), /another group/);
    await assert.rejects(syncPlayer(a, randomUUID(), '   '), /name with/);
    await assert.rejects(asUser(a, () => query("insert into public.players(group_id,name) values ($1,'Bypass')", [groupA.id])), /permission denied/);
    await assert.rejects(asUser(null, () => query("select public.sync_group_player($1,$2,'No')", [groupA.id, randomUUID()]), 'anon'), /permission denied/);
  });
});
