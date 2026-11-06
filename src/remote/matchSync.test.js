import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, matchReducer, matchRoster } from '../game/match.js';
import { assignMatchPlayers, loadDevelopmentGroup, registerPlayer } from '../game/registry.js';
import { cacheAuthorizedGroups, registryCache } from '../game/registryCache.js';
import { CLOSED_STORE, closeStoredMatch, createLocalId, listStoredMatches, loadStoredMatch, openMatchDatabase, saveStoredMatch, transactionDone } from '../game/storage.js';
import { matchPayload } from './matchPayload.js';
import { readClosedMatch, removeConfirmedMatch, uploadStoredMatch } from './matchSync.js';

const user = '11111111-1111-4111-8111-111111111111';
const group = { id: '22222222-2222-4222-8222-222222222222', name: 'Online group', time_zone: 'America/Toronto' };
const point = (state, team = 'A', playerId = 'p1') => matchReducer(state, { type: 'point', team, playerId, startedAt: '2026-11-06T23:00:00.000Z' });
const close = state => matchReducer(state, { type: 'closeSet' });

async function fixture(t) {
  const database = await openMatchDatabase(new IDBFactory()); t.after(() => database.close());
  await loadStoredMatch(database, () => null); await loadDevelopmentGroup(database);
  await cacheAuthorizedGroups(database, user, [group]);
  const state = createMatch(); const teams = structuredClone(state.teams); const players = [];
  for (const team of ['A', 'B']) for (let i = 0; i < 6; i++) {
    const person = await registerPlayer(database, group.id, `${team} Person ${i}`);
    players.push({ id: person.id, group_id: group.id, name: person.name }); teams[team].players[i].personId = person.id;
  }
  const match = close(point(assignMatchPlayers(state, group.id, teams, (await registryCache(database)).players)));
  await saveStoredMatch(database, match);
  const id = createLocalId(); const closedAt = '2026-11-07T01:00:00.000Z';
  await closeStoredMatch(database, match, { id, closedAt });
  const archive = await readClosedMatch(database, id);
  let activeUser = user;
  const remote = { stored: new Map(), submissions: 0, mode: 'success', players, snapshotCalls: 0 };
  remote.client = {
    auth: { getSession: async () => ({ data: { session: activeUser ? { user: { id: activeUser } } : null } }) },
    rpc: async (name, args) => {
      if (remote.mode === 'denied') return { data: null, error: { code: '42501', message: 'Not authorized' } };
      if (name === 'list_my_groups') return { data: [group] };
      if (name === 'get_group_registry') { remote.snapshotCalls++; return { data: { group, players: structuredClone(players) } }; }
      if (name === 'sync_group_player') throw new Error('Unexpected player upload in this fixture');
      assert.equal(name, 'submit_match'); remote.submissions++;
      assert.ok(await readClosedMatch(database, args.p_match.id), 'local archive must exist before remote call');
      if (remote.mode === 'failure') throw new Error('Network unavailable');
      const duplicate = remote.stored.has(args.p_match.id);
      remote.stored.set(args.p_match.id, structuredClone(args.p_match));
      const data = { status: duplicate ? 'already_saved' : 'saved', match_id: args.p_match.id,
        group_id: group.id, version: 1, submission: structuredClone(args.p_match) };
      if (remote.mode === 'lost') { remote.mode = 'success'; throw new Error('Response lost'); }
      if (remote.mode === 'mismatch') data.submission.sets[0].score_a++;
      if (remote.mode === 'account_changed') activeUser = createLocalId();
      if (remote.mode === 'local_changed') {
        const transaction = database.transaction(CLOSED_STORE, 'readwrite'); const done = transactionDone(transaction);
        transaction.objectStore(CLOSED_STORE).put({ ...archive, closedAt: '2026-11-07T02:00:00.000Z' }); await done;
      }
      return { data };
    },
  };
  return { database, id, archive, remote };
}

test('payload preserves per-set lineups, authors, ties, historical names and opponent errors without Undo/account fields', async t => {
  const { database, archive } = await fixture(t);
  let state = structuredClone(archive.state);
  const rosters = matchRoster(state);
  [rosters.A[0], rosters.B[0]] = [rosters.B[0], rosters.A[0]];
  for (const team of ['A', 'B']) rosters[team].forEach((person, i) => { person.id = `p${i + 1}`; });
  state = matchReducer(state, { type: 'roster', rosters });
  state = close(point(point(state, 'A'), 'B', 'err'));
  const payload = matchPayload({ ...archive, state, email: 'private@example.test' });
  assert.equal(payload.sets.length, 2);
  assert.equal(payload.sets[0].rosters.A[0].id, archive.state.teams.A.players[0].personId);
  assert.equal(payload.sets[1].rosters.A[0].id, archive.state.teams.B.players[0].personId);
  assert.equal(payload.sets[1].points[0].player_id, payload.sets[1].rosters.A[0].id);
  assert.deepEqual(payload.sets[1].points[1], { team: 'B', player_id: null, player_name: null, is_opponent_error: true });
  assert.equal(payload.sets[1].score_a, payload.sets[1].score_b);
  assert.equal('log' in payload, false); assert.equal('email' in payload, false);
  const old = structuredClone(archive); delete old.state.startedAt;
  assert.equal(matchPayload(old).started_at, null);
  assert.equal((await listStoredMatches(database)).length, 1);
});

test('confirmed upload deletes only that archive and keeps the active game, player cache and earlier pending matches', async t => {
  const { database, id, archive, remote } = await fixture(t);
  const earlier = { ...archive, id: createLocalId() };
  const transaction = database.transaction(CLOSED_STORE, 'readwrite'); const done = transactionDone(transaction);
  transaction.objectStore(CLOSED_STORE).add(earlier); await done;
  const active = await loadStoredMatch(database);
  const result = await uploadStoredMatch(database, id, remote.client);
  assert.equal(result.status, 'confirmed'); assert.equal(remote.stored.size, 1);
  assert.deepEqual(await loadStoredMatch(database), active);
  assert.deepEqual((await listStoredMatches(database)).map(match => match.id), [earlier.id]);
  assert.equal((await registryCache(database)).players.length, 12);
  assert.equal((await uploadStoredMatch(database, id, remote.client)).status, 'not_local');
  assert.equal(remote.submissions, 1);
});

test('lost acknowledgement keeps full archive and a repeated upload confirms the original UUID without duplication', async t => {
  const { database, id, archive, remote } = await fixture(t);
  remote.mode = 'lost';
  await assert.rejects(uploadStoredMatch(database, id, remote.client), /Response lost/);
  assert.deepEqual(await readClosedMatch(database, id), archive);
  const [first, second] = await Promise.all([uploadStoredMatch(database, id, remote.client), uploadStoredMatch(database, id, remote.client)]);
  assert.equal(first.status, 'confirmed'); assert.deepEqual(second, first);
  assert.equal(remote.stored.size, 1); assert.equal(remote.submissions, 2);
  assert.equal(await readClosedMatch(database, id), undefined);
});

for (const [mode, message] of [['failure', /Network unavailable/], ['mismatch', /confirmation/], ['denied', /Not authorized/], ['account_changed', /account changed/]]) {
  test(`${mode} preserves every local match field`, async t => {
    const { database, id, archive, remote } = await fixture(t); remote.mode = mode;
    await assert.rejects(uploadStoredMatch(database, id, remote.client), failure => message.test(failure.message));
    assert.deepEqual(await readClosedMatch(database, id), archive);
  });
}

test('an archive changed during upload is preserved even when the original was confirmed remotely', async t => {
  const { database, id, remote } = await fixture(t); remote.mode = 'local_changed';
  await assert.rejects(uploadStoredMatch(database, id, remote.client), /changed during upload/);
  assert.ok(await readClosedMatch(database, id)); assert.equal(remote.stored.size, 1);
});

test('failed local cleanup can be retried without sending a second match', async t => {
  const { database, id, archive, remote } = await fixture(t);
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    if (args[0] === CLOSED_STORE && args[1] === 'readwrite') {
      const store = transaction.objectStore(CLOSED_STORE); const remove = store.delete.bind(store);
      store.delete = key => { const request = remove(key); request.onsuccess = () => transaction.abort(); return request; };
    }
    return transaction;
  };
  await assert.rejects(uploadStoredMatch(database, id, remote.client));
  assert.deepEqual(await readClosedMatch(database, id), archive);
  database.transaction = original;
  assert.equal((await uploadStoredMatch(database, id, remote.client)).status, 'confirmed');
  assert.equal(remote.stored.size, 1);
});

test('participants with unresolved identities are never submitted', async t => {
  const { database, id, archive, remote } = await fixture(t);
  remote.players[0] = { ...remote.players[0], id: createLocalId() };
  await assert.rejects(uploadStoredMatch(database, id, remote.client), /Resolve the participants/);
  assert.deepEqual(await readClosedMatch(database, id), archive);
  assert.equal(remote.submissions, 0);
});

test('a confirmation with a different UUID/group/version cannot delete the archive', async t => {
  const { database, archive, id } = await fixture(t);
  const submission = matchPayload(archive);
  const confirmation = { status: 'saved', match_id: id, group_id: group.id, version: 1, submission };
  for (const change of [{ match_id: createLocalId() }, { group_id: createLocalId() }, { version: 0 }, { status: 'pending' }, { submission: null }]) {
    await assert.rejects(removeConfirmedMatch(database, archive, submission, { ...confirmation, ...change }), /confirmation/);
    assert.deepEqual(await readClosedMatch(database, id), archive);
  }
  // JSON key ordering from PostgreSQL must not prevent cleanup.
  confirmation.submission = Object.fromEntries(Object.entries(submission).reverse());
  await removeConfirmedMatch(database, archive, submission, confirmation);
  assert.equal(await readClosedMatch(database, id), undefined);
});
