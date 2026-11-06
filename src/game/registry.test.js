import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, matchReducer, restoreMatch } from './match.js';
import { ACTIVE_STORE, CLOSED_STORE, GROUP_STORE, closeStoredMatch, createLocalId,
  listStoredMatches, loadStoredMatch, openMatchDatabase, saveStoredMatch, transactionDone } from './storage.js';
import { assignMatchPlayers, listPlayers, loadDevelopmentGroup, normalizeName, registerPlayer, saveMatchPlayers } from './registry.js';

async function setup(t) {
  const factory = new IDBFactory();
  const database = await openMatchDatabase(factory);
  t.after(() => database.close());
  const group = await loadDevelopmentGroup(database);
  return { database, factory, group };
}

async function roster(database, group, state = createMatch()) {
  const players = [];
  const teams = structuredClone(state.teams);
  for (const id of ['A', 'B']) for (let i = 0; i < 6; i++) {
    const player = await registerPlayer(database, group.id, `${id} Player ${i + 1}`);
    players.push(player);
    teams[id].players[i].personId = player.id;
  }
  return { teams, players };
}
const point = state => matchReducer(state, { type: 'point', team: 'A', playerId: 'p1' });

test('database v1 upgrades preserve active and closed matches without assigning identities', async t => {
  const factory = new IDBFactory();
  const legacy = await new Promise((resolve, reject) => {
    const request = factory.open('volleyball-scoreboard', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ACTIVE_STORE);
      request.result.createObjectStore(CLOSED_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const state = point(createMatch());
  const transaction = legacy.transaction([ACTIVE_STORE, CLOSED_STORE], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(ACTIVE_STORE).put({ formatVersion: 1, state }, 'current');
  transaction.objectStore(CLOSED_STORE).put({ id: 'old', original: true });
  await done;
  legacy.close();
  const database = await openMatchDatabase(factory);
  t.after(() => database.close());
  assert.equal(database.version, 3);
  assert.deepEqual(await loadStoredMatch(database), state);
  const read = database.transaction(CLOSED_STORE);
  const readDone = transactionDone(read);
  const request = read.objectStore(CLOSED_STORE).get('old');
  await readDone;
  assert.deepEqual(request.result, { id: 'old', original: true });
  await loadDevelopmentGroup(database);
  assert.deepEqual(await listPlayers(database, (await loadDevelopmentGroup(database)).id), []);
});

test('group and UUID identities survive database reopen; names normalize without merging people', async t => {
  const { database, factory, group } = await setup(t);
  assert.equal(normalizeName('  JOÃO   Sílva '), 'joao silva');
  const player = await registerPlayer(database, group.id, '  João   Silva ');
  assert.equal(player.name, 'João Silva');
  assert.match(player.id, /^[0-9a-f-]{36}$/);
  await assert.rejects(registerPlayer(database, group.id, 'joao silva'), error => error.existingPlayer.id === player.id);
  await assert.rejects(registerPlayer(database, group.id, 'João'), /surname/);
  await assert.rejects(registerPlayer(database, group.id, '  '));
  await assert.rejects(registerPlayer(database, group.id, 'x'.repeat(61)));
  const another = await registerPlayer(database, group.id, 'João Costa');
  assert.notEqual(another.id, player.id);
  database.close();
  const reopened = await openMatchDatabase(factory);
  t.after(() => reopened.close());
  assert.deepEqual(await loadDevelopmentGroup(reopened), group);
  assert.deepEqual((await listPlayers(reopened, group.id)).map(p => p.id).sort(), [player.id, another.id].sort());
});

test('simultaneous duplicate registrations commit only one player; groups stay independent', async t => {
  const { database, group } = await setup(t);
  const results = await Promise.allSettled([registerPlayer(database, group.id, 'Ana'), registerPlayer(database, group.id, 'ÁNA')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const other = { ...group, id: createLocalId(), name: 'Another group' };
  const transaction = database.transaction(GROUP_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(GROUP_STORE).add(other);
  await done;
  const player = await registerPlayer(database, other.id, 'Ana');
  assert.equal((await listPlayers(database, other.id))[0].id, player.id);
  assert.equal((await listPlayers(database, group.id)).length, 1);
  await assert.rejects(registerPlayer(database, createLocalId(), 'Missing group'));
});

test('explicit association preserves scores, historical names, Undo and permanent IDs after reload/reset/close', async t => {
  const { database, group } = await setup(t);
  const state = matchReducer(point(point(createMatch())), { type: 'closeSet' });
  const { teams } = await roster(database, group, state);
  await saveStoredMatch(database, state);
  const bound = await saveMatchPlayers(database, state, group.id, teams);
  assert.equal(bound.teams.A.players[0].matchPoints, 2);
  assert.equal(bound.teams.A.players[0].name, 'A Player 1');
  assert.equal(bound.log[0].playerName, 'Anderson');
  assert.equal(bound.log[0].personId, teams.A.players[0].personId);
  assert.deepEqual(await loadStoredMatch(database), bound);
  assert.deepEqual(restoreMatch(JSON.stringify(bound)), bound);
  const reopenedSet = matchReducer(bound, { type: 'undo' });
  assert.equal(reopenedSet.teams.A.players[0].setPoints, 2);
  assert.equal(matchReducer(reopenedSet, { type: 'undo' }).teams.A.players[0].setPoints, 1);
  const next = await closeStoredMatch(database, bound);
  assert.equal(next.groupId, group.id);
  assert.equal(next.teams.A.players[0].personId, bound.teams.A.players[0].personId);
  assert.deepEqual(restoreMatch(JSON.stringify(next)), next);
  const scored = point(next);
  assert.equal(scored.log[0].personId, bound.teams.A.players[0].personId);
  const rearranged = structuredClone(next.teams);
  [rearranged.A.players[0].personId, rearranged.B.players[0].personId] = [rearranged.B.players[0].personId, rearranged.A.players[0].personId];
  const moved = assignMatchPlayers(next, group.id, rearranged, await listPlayers(database, group.id));
  assert.equal(moved.teams.B.players[0].personId, bound.teams.A.players[0].personId);
  assert.equal(moved.teams.B.players[0].name, bound.teams.A.players[0].name);
  assert.equal((await listStoredMatches(database))[0].state.teams.A.players[0].personId, bound.teams.A.players[0].personId);
  const corrupt = structuredClone(scored);
  corrupt.log[0].personId = createLocalId();
  assert.throws(() => restoreMatch(JSON.stringify(corrupt)), /identity/);
});

test('incomplete, duplicate, cross-group and in-progress identity changes cannot be saved', async t => {
  const { database, group } = await setup(t);
  const state = createMatch();
  const { teams, players } = await roster(database, group);
  assert.throws(() => assignMatchPlayers(state, group.id, state.teams, players), /all 12/);
  const repeated = structuredClone(teams);
  repeated.B.players[0].personId = repeated.A.players[0].personId;
  assert.throws(() => assignMatchPlayers(state, group.id, repeated, players), /more than one/);
  assert.throws(() => assignMatchPlayers(state, createLocalId(), teams, players));
  const bound = assignMatchPlayers(state, group.id, teams, players);
  const scored = point(bound);
  const swapped = structuredClone(teams);
  [swapped.A.players[0].personId, swapped.B.players[0].personId] = [swapped.B.players[0].personId, swapped.A.players[0].personId];
  assert.throws(() => assignMatchPlayers(scored, group.id, swapped, players), /between sets/);
  const unchanged = assignMatchPlayers(scored, group.id, teams, players);
  assert.deepEqual(unchanged, scored);
});

test('associating an old archive keeps all original names, scores and metadata without changing current match', async t => {
  const { database, group } = await setup(t);
  const state = matchReducer(point(createMatch()), { type: 'closeSet' });
  await saveStoredMatch(database, state);
  const current = await closeStoredMatch(database, state, { id: 'legacy' });
  const before = (await listStoredMatches(database))[0];
  const { teams } = await roster(database, group, state);
  await saveMatchPlayers(database, state, group.id, teams, 'legacy');
  const after = (await listStoredMatches(database))[0];
  assert.equal(after.closedAt, before.closedAt);
  assert.equal(after.syncStatus, before.syncStatus);
  assert.equal(after.state.teams.A.players[0].name, 'Anderson');
  assert.equal(after.state.teams.A.players[0].matchPoints, 1);
  assert.equal(after.state.log[0].playerName, 'Anderson');
  assert.equal(after.state.groupId, group.id);
  assert.deepEqual(await loadStoredMatch(database), current);
  await assert.rejects(saveMatchPlayers(database, after.state, group.id, teams, 'legacy'), /already associated/);
});

test('failed association rolls back and stale views cannot overwrite a changed match', async t => {
  const { database, group } = await setup(t);
  const state = createMatch();
  const { teams } = await roster(database, group);
  await saveStoredMatch(database, state);
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(saveMatchPlayers(database, state, group.id, teams));
  database.transaction = original;
  assert.deepEqual(await loadStoredMatch(database), state);
  const scored = point(state);
  await saveStoredMatch(database, scored);
  await assert.rejects(saveMatchPlayers(database, state, group.id, teams), /changed/);
  assert.deepEqual(await loadStoredMatch(database), scored);
  assert.equal((await listPlayers(database, group.id)).length, 12);
});

test('failed registration leaves no partial player and can be retried', async t => {
  const { database, group } = await setup(t);
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(registerPlayer(database, group.id, 'Retry Player'));
  database.transaction = original;
  assert.deepEqual(await listPlayers(database, group.id), []);
  await registerPlayer(database, group.id, 'Retry Player');
  assert.equal((await listPlayers(database, group.id)).length, 1);
});
