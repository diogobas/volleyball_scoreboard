import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = '20261109000200_communities_and_scoped_public_access.sql';
test('communities inherit group administration, reuse explicit player identities and expose only scoped public results', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of (await readdir(new URL('./migrations/', import.meta.url))).filter(file => file.endsWith('.sql') && file < migration).sort()) await db.exec(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  const q = (sql, args = []) => db.query(sql, args);
  const [owner, groupAdmin, otherAdmin, guest, unconfirmed] = Array.from({ length: 5 }, () => randomUUID());
  for (const [id, email] of [[owner, 'diogovvb@gmail.com'], [groupAdmin, 'group@test.local'], [otherAdmin, 'other@test.local'], [guest, 'guest@test.local'], [unconfirmed, 'unconfirmed@test.local']]) {
    await q('insert into auth.users values($1,$2,$3)', [id, email, id === unconfirmed ? null : '2026-11-09T12:00:00Z']);
  }
  async function as(user, action, role = 'authenticated') {
    await db.exec(`begin;set local role ${role};`);
    try {
      await q("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
      const result = await action(); await db.exec('commit'); return result;
    } catch (error) { await db.exec('rollback'); throw error; }
  }
  const rpc = (name, args = [], user = owner, role = 'authenticated') => as(user, () => q(`select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})) as data`, args), role).then(r => r.rows[0]?.data);
  const legacy = await rpc('create_group', ['Existing Montreal group', 'America/Toronto'], groupAdmin);
  const sourceId = randomUUID(); await rpc('save_group_player', [legacy.id, sourceId, 'Same Name', 'fixed', null], groupAdmin);
  const historicalId = randomUUID();
  await rpc('save_historical_match', [legacy.id, { format_version: 3, id: historicalId, group_id: legacy.id, played_on: '2026-11-03', rules: 'recreational', team_a_name: 'Home', team_b_name: 'Away', player_totals_recorded: false, players: [], errors_a: null, errors_b: null, sets: [{ score_a: 25, score_b: 20, early_finish: false }] }, null, 'Existing history', randomUUID()], groupAdmin);
  const previousSummary = await rpc('public_group_period_summary', [legacy.id, 2026, 1, 'fall'], null, 'anon');
  await db.exec(await readFile(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
  const community = (await rpc('list_my_communities'))[0];
  let target, otherCommunity, foreign;
  await t.test('migration assigns existing groups to Montreal and promotes only the explicitly named confirmed owner', async () => {
    assert.equal(community.name, 'Montreal Volleyball Community'); assert.equal(community.region, 'Montreal');
    assert.equal(community.display_id, 'C-1');
    const migratedSummary = await rpc('public_group_period_summary', [legacy.id, 2026, 1, 'fall'], null, 'anon');
    assert.equal(migratedSummary.match_count, previousSummary.match_count);
    assert.equal(migratedSummary.point_count, previousSummary.point_count);
    assert.deepEqual(migratedSummary.matches, previousSummary.matches);
    assert.equal(migratedSummary.matches[0].id, historicalId);
    assert.deepEqual(await rpc('list_my_communities', [], groupAdmin), []);
    const ownGroups = await as(owner, () => q('select * from public.list_my_groups()'));
    assert.equal(ownGroups.rows.length, 1); assert.equal(ownGroups.rows[0].id, legacy.id);
    assert.equal(ownGroups.rows[0].community_id, community.id);
    assert.ok((await rpc('get_group_registry', [legacy.id])).players[0].community_person_id);
    assert.equal((await rpc('get_group_registry', [legacy.id], groupAdmin)).players[0].id, sourceId);
    assert.equal((await rpc('list_community_admins', [community.id]))[0].email, 'diogovvb@gmail.com');
  });
  await t.test('community administrators see all their groups; group administrators cannot access siblings or other communities', async () => {
    target = await rpc('create_community_group', [community.id, 'New Montreal group', 'America/Toronto']);
    otherCommunity = await rpc('create_community', ['Other community', 'Ottawa'], otherAdmin);
    foreign = await rpc('create_community_group', [otherCommunity.id, 'Other region group', 'America/Toronto'], otherAdmin);
    assert.equal((await as(owner, () => q('select * from public.list_my_groups()'))).rows.length, 2);
    assert.equal((await as(groupAdmin, () => q('select * from public.list_my_groups()'))).rows.length, 1);
    await assert.rejects(rpc('get_group_registry', [target.id], groupAdmin), /Only group administrators/);
    await assert.rejects(rpc('get_group_registry', [foreign.id]), /Only group administrators/);
    await assert.rejects(rpc('create_community_group', [community.id, 'Unauthorized', 'UTC'], groupAdmin), /Only community administrators/);
    await assert.rejects(rpc('grant_community_admin', [community.id, 'guest@test.local'], groupAdmin), /Only community administrators/);
    await assert.rejects(rpc('create_community', ['No', 'No'], unconfirmed), /confirmed email/);
    assert.equal((await as(groupAdmin, () => q('select id from public.groups'))).rows.length, 1);
    assert.equal((await as(owner, () => q('select id from public.groups'))).rows.length, 2);
  });
  await t.test('community player reuse is explicit, atomic, idempotent and keeps category and history group-local', async () => {
    const people = await rpc('list_community_players', [community.id, '', 1]);
    assert.equal(people.total, 1); const person = people.players[0];
    assert.equal(person.groups[0].id, legacy.id);
    assert.equal((await rpc('list_community_players', [community.id, 'same', 1])).total, 1);
    assert.equal((await rpc('import_community_players', [target.id, [person.id], 'sub'])).added, 1);
    assert.equal((await rpc('import_community_players', [target.id, [person.id], 'fixed'])).added, 0);
    const imported = (await rpc('get_group_registry', [target.id])).players[0];
    assert.notEqual(imported.id, sourceId); assert.equal(imported.community_person_id, person.id); assert.equal(imported.category, 'sub');
    const original = (await rpc('get_group_registry', [legacy.id])).players[0]; assert.equal(original.category, 'fixed');
    await rpc('save_group_player', [legacy.id, sourceId, 'Local renamed player', 'fixed', original.version], groupAdmin);
    assert.equal((await rpc('get_group_registry', [target.id])).players[0].name, 'Same Name');
    await assert.rejects(rpc('list_community_players', [community.id, '', 1], groupAdmin), /Only community administrators/);
    await assert.rejects(rpc('import_community_players', [target.id, [person.id], 'sub'], groupAdmin), /Only community administrators/);
    await assert.rejects(rpc('import_community_players', [foreign.id, [person.id], 'sub'], otherAdmin), /does not belong to this community/);
    assert.equal((await rpc('get_group_registry', [foreign.id], otherAdmin)).players.length, 0);
    const fresh = await rpc('create_community_group', [community.id, 'Atomic import test', 'UTC']);
    await assert.rejects(rpc('import_community_players', [fresh.id, [person.id, randomUUID()], 'sub']), /does not belong/);
    assert.equal((await rpc('get_group_registry', [fresh.id])).players.length, 0);
    await rpc('delete_group_player', [target.id, imported.id, imported.version]);
    await rpc('import_community_players', [target.id, [person.id], 'fixed']);
    const restored = (await rpc('get_group_registry', [target.id])).players[0];
    assert.equal(restored.id, imported.id); assert.equal(restored.category, 'fixed'); assert.ok(restored.version > imported.version);
    // Equal names in two groups are not silently merged into one person.
    await rpc('save_group_player', [fresh.id, randomUUID(), 'Same Name', 'sub', null]);
    assert.equal((await rpc('list_community_players', [community.id, '', 1])).total, 2);
    const sameNames = (await rpc('list_community_players', [community.id, '', 1])).players;
    const otherPerson = sameNames.find(row => row.id !== person.id);
    await assert.rejects(rpc('import_community_players', [target.id, [otherPerson.id], 'sub']), /different player named/);
  });
  await t.test('access grants and revocations apply to every inherited group without leaving creator access behind', async () => {
    await rpc('grant_community_admin', [community.id, 'guest@test.local']);
    await rpc('get_group_registry', [target.id], guest);
    const created = await rpc('create_community_group', [community.id, 'Guest-created group', 'UTC'], guest);
    await rpc('revoke_community_admin', [community.id, guest]);
    await assert.rejects(rpc('get_group_registry', [target.id], guest), /Only group administrators/);
    await assert.rejects(rpc('get_group_registry', [created.id], guest), /Only group administrators/);
    await assert.rejects(rpc('revoke_community_admin', [community.id, owner]), /at least one/);
    await assert.rejects(rpc('grant_community_admin', [community.id, 'unconfirmed@test.local']), /confirmed account/);
    await rpc('claim_initial_community', [], guest); assert.deepEqual(await rpc('list_my_communities', [], guest), []);
  });
  await t.test('public links scope groups and communities while global table enumeration and administrative catalogs are unavailable', async () => {
    const anon = (name, args) => rpc(name, args, null, 'anon');
    const data = await anon('public_community', [community.display_id]);
    assert.equal(data.community.id, community.id); assert.ok(data.groups.some(g => g.id === target.id));
    assert.ok(!data.groups.some(g => g.id === foreign.id)); assert.ok(!JSON.stringify(data).includes('diogovvb'));
    const info = await anon('public_group_info', [target.display_id]); assert.equal(info.id, target.id); assert.equal(info.community.id, community.id);
    assert.equal((await anon('public_group_period_summary', [target.id, 2026, 1, 'fall'])).group.community.id, community.id);
    for (const table of ['communities', 'groups', 'players', 'matches', 'match_sets', 'set_players', 'match_points', 'match_player_totals']) {
      await assert.rejects(as(null, () => q(`select * from public.${table}`), 'anon'), /permission denied/);
    }
    for (const name of ['list_my_communities', 'list_my_groups']) await assert.rejects(anon(name, []), /permission denied/);
    await assert.rejects(anon('list_community_players', [community.id, '', 1]), /permission denied/);
    await assert.rejects(anon('public_community', ['']), /not found/);
    await assert.rejects(anon('public_group_info', ['']), /not found/);
  });
  await t.test('public RPCs never expose unpublished results after moving from invoker RLS to scoped definer reads', async () => {
    const id = randomUUID();
    await q("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,published,entry_mode,played_on) values($1,$2,now(),1,0,'{}',false,'summary','2026-11-09')", [id, target.id]);
    assert.equal((await rpc('public_group_period_summary', [target.id, 2026, 1, 'fall'], null, 'anon')).match_count, 0);
    assert.equal((await rpc('public_group_summary', [target.id, 2026, 1], null, 'anon')).match_count, 0);
    await assert.rejects(rpc('public_match_details', [target.id, id], null, 'anon'), /not found/);
    await q('update public.matches set published=true where id=$1', [id]);
    const details = await rpc('public_match_details', [target.id, id], null, 'anon');
    assert.equal(details.id, id); assert.equal(details.group.community.id, community.id);
    assert.equal((await rpc('public_group_period_summary', [target.id, 2026, 1, 'fall'], null, 'anon')).match_count, 1);
    await assert.rejects(rpc('public_match_details', [foreign.id, id], null, 'anon'), /not found/);
    await assert.rejects(rpc('delete_final_match', [target.id, id, 1, 'Delete']), /cannot be deleted/);
  });
});
