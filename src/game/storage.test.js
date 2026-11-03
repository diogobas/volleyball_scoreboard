import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, matchReducer } from './match.js';
import { ACTIVE_STORE, CLOSED_STORE, DATABASE_NAME, DATABASE_VERSION,
  loadStoredMatch, openMatchDatabase, saveStoredMatch } from './storage.js';

const point = (state, team = 'A') => matchReducer(state, { type: 'point', team, playerId: 'p1' });

function storedValue(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName);
    const request = transaction.objectStore(storeName).get(key);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

test('creates a versioned database with separate active and closed match stores', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  assert.equal(database.name, DATABASE_NAME);
  assert.equal(database.version, DATABASE_VERSION);
  assert.deepEqual([...database.objectStoreNames], [ACTIVE_STORE, CLOSED_STORE]);
  assert.deepEqual(await loadStoredMatch(database, () => null), createMatch());
  assert.equal((await storedValue(database, ACTIVE_STORE, 'current')).formatVersion, 1);
  assert.equal(await storedValue(database, CLOSED_STORE, 'current'), undefined);
});

test('migrates names, scores, side changes, set history and undo, retaining the legacy copy', async t => {
  const factory = new IDBFactory();
  let database = await openMatchDatabase(factory);
  t.after(() => database.close());
  let state = point(point(createMatch()), 'B');
  const teams = structuredClone(state.teams);
  teams.A.name = 'Blue';
  teams.A.players[0].name = 'Ana';
  state = matchReducer(state, { type: 'edit', teams });
  state = point(matchReducer(state, { type: 'closeSet' }), 'B');
  const legacy = JSON.stringify(state);
  assert.deepEqual(await loadStoredMatch(database, () => legacy), state);
  database.close();
  database = await openMatchDatabase(factory);
  const restored = await loadStoredMatch(database, () => { throw new Error('Must not access legacy again'); });
  assert.deepEqual(restored, state);
  assert.deepEqual(matchReducer(restored, { type: 'undo' }), matchReducer(state, { type: 'undo' }));
  const undone = matchReducer(matchReducer(restored, { type: 'undo' }), { type: 'undo' });
  assert.equal(undone.currentSet, 1);
  assert.equal(undone.teams.A.players[0].setPoints, 1);
});

test('commits consecutive saves in order and leaves archived matches untouched', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const archive = { id: 'previous', data: 'preserved' };
  const transaction = database.transaction(CLOSED_STORE, 'readwrite');
  transaction.objectStore(CLOSED_STORE).put(archive);
  const first = point(createMatch());
  const second = point(first);
  await Promise.all([saveStoredMatch(database, first), saveStoredMatch(database, second)]);
  assert.deepEqual(await loadStoredMatch(database), second);
  assert.deepEqual(await storedValue(database, CLOSED_STORE, archive.id), archive);
});

test('concurrent initializations use the first committed match without reimporting legacy data', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = point(createMatch());
  const results = await Promise.all([
    loadStoredMatch(database, () => JSON.stringify(state)),
    loadStoredMatch(database, () => { throw new Error('Must not import twice'); }),
  ]);
  results.forEach(result => assert.deepEqual(result, state));
});

test('invalid legacy data never creates or overwrites an active match', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  for (const raw of ['{', '{}', 'null']) {
    await assert.rejects(loadStoredMatch(database, () => raw));
    assert.equal(await storedValue(database, ACTIVE_STORE, 'current'), undefined);
  }
  const state = point(createMatch());
  assert.deepEqual(await loadStoredMatch(database, () => JSON.stringify(state)), state);
});

test('unavailable legacy storage does not silently start an empty match', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  await assert.rejects(loadStoredMatch(database, () => { throw new Error('Storage denied'); }), /Storage denied/);
  assert.equal(await storedValue(database, ACTIVE_STORE, 'current'), undefined);
});

test('aborted save rejects and preserves the previous committed match for a retry', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const previous = point(createMatch());
  await saveStoredMatch(database, previous);
  const originalTransaction = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = originalTransaction(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(saveStoredMatch(database, point(previous)));
  database.transaction = originalTransaction;
  assert.deepEqual(await loadStoredMatch(database), previous);
  await saveStoredMatch(database, point(previous));
  assert.deepEqual(await loadStoredMatch(database), point(previous));
});

test('unsupported or corrupt IndexedDB records are preserved instead of falling back to stale legacy', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  for (const record of [{ formatVersion: 2, state: createMatch() }, { formatVersion: 1, state: {} }]) {
    const transaction = database.transaction(ACTIVE_STORE, 'readwrite');
    transaction.objectStore(ACTIVE_STORE).put(record, 'current');
    await assert.rejects(loadStoredMatch(database, () => JSON.stringify(createMatch())));
    assert.deepEqual(await storedValue(database, ACTIVE_STORE, 'current'), record);
  }
});

test('unavailable IndexedDB reports failure', async () => {
  await assert.rejects(openMatchDatabase(null), /unavailable/);
});
