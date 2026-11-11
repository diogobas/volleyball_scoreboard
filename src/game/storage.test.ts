import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readableArchive } from '../test/assertions';
import { createMatch, matchReducer } from './match';
import {
  ACTIVE_STORE,
  CLOSED_STORE,
  DATABASE_NAME,
  DATABASE_VERSION,
  GROUP_STORE,
  PLAYER_STORE,
  SETTINGS_STORE,
  closeStoredMatch,
  listStoredMatches,
  loadStoredMatch,
  openMatchDatabase,
  saveStoredMatch,
} from './storage';
import type { MatchArchive, MatchState, TeamId } from './types';

const point = (state: MatchState, team: TeamId = 'A') =>
  matchReducer(state, { type: 'point', team, playerId: 'p1' });

const storedValue = (database: IDBDatabase, storeName: string, key: string) => {
  return new Promise<{ formatVersion: number; state: MatchState }>((resolve, reject) => {
    const transaction = database.transaction(storeName);
    const request = transaction.objectStore(storeName).get(key);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
};

test('creates a versioned database with separate active and closed match stores', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  assert.equal(database.name, DATABASE_NAME);
  assert.equal(database.version, DATABASE_VERSION);
  assert.deepEqual(
    [...database.objectStoreNames],
    [ACTIVE_STORE, CLOSED_STORE, GROUP_STORE, PLAYER_STORE, SETTINGS_STORE],
  );
  assert.deepEqual(await loadStoredMatch(database, () => null), createMatch());
  assert.equal((await storedValue(database, ACTIVE_STORE, 'current')).formatVersion, 1);
  assert.equal(await storedValue(database, CLOSED_STORE, 'current'), undefined);
});

test('migrates names, scores, side changes, set history and undo, retaining the legacy copy', async (t) => {
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
  const restored = await loadStoredMatch(database, () => {
    throw new Error('Must not access legacy again');
  });
  assert.deepEqual(restored, state);
  assert.deepEqual(matchReducer(restored, { type: 'undo' }), matchReducer(state, { type: 'undo' }));
  const undone = matchReducer(matchReducer(restored, { type: 'undo' }), { type: 'undo' });
  assert.equal(undone.currentSet, 1);
  assert.equal(undone.teams.A.players[0].setPoints, 1);
});

test('commits consecutive saves in order and leaves archived matches untouched', async (t) => {
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

test('concurrent initializations use the first committed match without reimporting legacy data', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = point(createMatch());
  const results = await Promise.all([
    loadStoredMatch(database, () => JSON.stringify(state)),
    loadStoredMatch(database, () => {
      throw new Error('Must not import twice');
    }),
  ]);
  results.forEach((result) => assert.deepEqual(result, state));
});

test('invalid legacy data never creates or overwrites an active match', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  for (const raw of ['{', '{}', 'null']) {
    await assert.rejects(loadStoredMatch(database, () => raw));
    assert.equal(await storedValue(database, ACTIVE_STORE, 'current'), undefined);
  }
  const state = point(createMatch());
  assert.deepEqual(await loadStoredMatch(database, () => JSON.stringify(state)), state);
});

test('unavailable legacy storage does not silently start an empty match', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  await assert.rejects(
    loadStoredMatch(database, () => {
      throw new Error('Storage denied');
    }),
    /Storage denied/,
  );
  assert.equal(await storedValue(database, ACTIVE_STORE, 'current'), undefined);
});

test('aborted save rejects and preserves the previous committed match for a retry', async (t) => {
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

test('unsupported or corrupt IndexedDB records are preserved instead of falling back to stale legacy', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  for (const record of [
    { formatVersion: 2, state: createMatch() },
    { formatVersion: 1, state: {} },
  ]) {
    const transaction = database.transaction(ACTIVE_STORE, 'readwrite');
    transaction.objectStore(ACTIVE_STORE).put(record, 'current');
    await assert.rejects(loadStoredMatch(database, () => JSON.stringify(createMatch())));
    assert.deepEqual(await storedValue(database, ACTIVE_STORE, 'current'), record);
  }
});

test('unavailable IndexedDB reports failure', async () => {
  await assert.rejects(openMatchDatabase(null), /unavailable/);
});

const closedSet = (state = createMatch(), team: TeamId = 'A') =>
  matchReducer(point(state, team), { type: 'closeSet' });

test('closing archives the full match and starts a persisted empty match preserving names and sides', async (t) => {
  const factory = new IDBFactory();
  let database = await openMatchDatabase(factory);
  t.after(() => database.close());
  let state = closedSet(closedSet());
  const teams = structuredClone(state.teams);
  teams.A.name = 'Blue';
  teams.A.players[0].name = 'Ana';
  state = matchReducer(state, { type: 'edit', teams });
  state = matchReducer(state, { type: 'switchSides' });
  await saveStoredMatch(database, state);
  const next = await closeStoredMatch(database, state);
  assert.equal(next.currentSet, 1);
  assert.deepEqual(next.log, []);
  assert.equal(next.sidesSwapped, state.sidesSwapped);
  for (const id of ['A', 'B'] as const) {
    assert.equal(next.teams[id].name, state.teams[id].name);
    assert.equal(next.teams[id].setsWon, 0);
    next.teams[id].players.forEach(
      (player: { name: unknown; setPoints: unknown; matchPoints: unknown }, index: number) => {
        assert.equal(player.name, state.teams[id].players[index].name);
        assert.equal(player.setPoints, 0);
        assert.equal(player.matchPoints, 0);
      },
    );
  }
  database.close();
  database = await openMatchDatabase(factory);
  assert.deepEqual(await loadStoredMatch(database), next);
  const archives = await new Promise<MatchArchive[]>((resolve) => {
    const request = database.transaction(CLOSED_STORE).objectStore(CLOSED_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
  });
  assert.equal(archives.length, 1);
  const archive = archives[0];
  assert.match(archive.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Date(archive.closedAt).toISOString(), archive.closedAt);
  assert.equal(archive.syncStatus, 'pending');
  assert.equal(archive.formatVersion, 1);
  assert.deepEqual(archive.state, state);
  await saveStoredMatch(database, point(next));
  assert.deepEqual(await storedValue(database, CLOSED_STORE, archive.id), archive);
  assert.deepEqual(matchReducer(next, { type: 'undo' }), next);
});

test('empty matches and matches with an open set cannot be closed, even after completed sets', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  for (const state of [createMatch(), point(createMatch()), point(closedSet())]) {
    await saveStoredMatch(database, state);
    await assert.rejects(closeStoredMatch(database, state));
    assert.deepEqual(await loadStoredMatch(database), state);
  }
});

test('draws and manually closed tied sets are valid completed matches', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = matchReducer(point(point(createMatch()), 'B'), { type: 'closeSet' });
  assert.equal(state.teams.A.setsWon, state.teams.B.setsWon);
  await saveStoredMatch(database, state);
  await closeStoredMatch(database, state, { id: 'draw' });
  assert.deepEqual((await storedValue(database, CLOSED_STORE, 'draw')).state, state);
});

test('an abort after the archive write rolls back both stores, allowing a later retry', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  await saveStoredMatch(database, state);
  const originalTransaction = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = originalTransaction(...args);
    if (Array.isArray(args[0])) {
      const store = transaction.objectStore(CLOSED_STORE);
      const originalAdd = store.add.bind(store);
      store.add = (...values) => {
        const request = originalAdd(...values);
        request.onsuccess = () => transaction.abort();
        return request;
      };
    }
    return transaction;
  };
  await assert.rejects(closeStoredMatch(database, state, { id: 'retry' }));
  database.transaction = originalTransaction;
  assert.deepEqual(await loadStoredMatch(database), state);
  assert.equal(await storedValue(database, CLOSED_STORE, 'retry'), undefined);
  await closeStoredMatch(database, state, { id: 'retry' });
  assert.deepEqual((await storedValue(database, CLOSED_STORE, 'retry')).state, state);
});

test('duplicate archive IDs cannot replace archives or reset the current match', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  await saveStoredMatch(database, state);
  await closeStoredMatch(database, state, { id: 'existing' });
  const previous = await storedValue(database, CLOSED_STORE, 'existing');
  const another = closedSet(createMatch(), 'B');
  await saveStoredMatch(database, another);
  await assert.rejects(closeStoredMatch(database, another, { id: 'existing' }));
  assert.deepEqual(await loadStoredMatch(database), another);
  assert.deepEqual(await storedValue(database, CLOSED_STORE, 'existing'), previous);
});

test('concurrent closures cannot archive the same saved match twice', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  await saveStoredMatch(database, state);
  const results = await Promise.allSettled([
    closeStoredMatch(database, state, { id: 'first' }),
    closeStoredMatch(database, state, { id: 'second' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(await storedValue(database, CLOSED_STORE, 'second'), undefined);
});

test('closing a stale view does not discard changes saved by another tab', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  const changed = point(state);
  await saveStoredMatch(database, changed);
  await assert.rejects(closeStoredMatch(database, state, { id: 'stale' }), /saved match changed/);
  assert.deepEqual(await loadStoredMatch(database), changed);
  assert.equal(await storedValue(database, CLOSED_STORE, 'stale'), undefined);
});

test('history starts empty and excludes the current match', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  await saveStoredMatch(database, closedSet());
  assert.deepEqual(await listStoredMatches(database), []);
});

test('history reads persisted archives newest first without changing either store', async (t) => {
  const factory = new IDBFactory();
  let database = await openMatchDatabase(factory);
  t.after(() => database.close());
  const first = closedSet();
  const second = closedSet(createMatch(), 'B');
  await saveStoredMatch(database, first);
  await closeStoredMatch(database, first, { id: 'older', closedAt: '2026-11-05T12:00:00.000Z' });
  await saveStoredMatch(database, second);
  await closeStoredMatch(database, second, { id: 'newer', closedAt: '2026-11-06T12:00:00.000Z' });
  const current = point(createMatch());
  await saveStoredMatch(database, current);
  database.close();
  database = await openMatchDatabase(factory);
  const matches = await listStoredMatches(database);
  assert.deepEqual(
    matches.map((match) => match.id),
    ['newer', 'older'],
  );
  assert.equal(matches.filter((match) => match.syncStatus === 'pending').length, 2);
  assert.deepEqual(readableArchive(matches[0]).state, second);
  assert.deepEqual(readableArchive(matches[1]).state, first);
  assert.deepEqual(await loadStoredMatch(database), current);
  for (const archive of matches)
    assert.deepEqual(await storedValue(database, CLOSED_STORE, archive.id), archive);
});

test('one unreadable archive remains visible and does not prevent reading healthy matches', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  await saveStoredMatch(database, state);
  await closeStoredMatch(database, state, { id: 'healthy' });
  const records = [
    { id: 'unsupported', formatVersion: 2, syncStatus: 'pending', state },
    { id: 'invalid', formatVersion: 1, closedAt: new Date().toISOString(), state: {} },
    {
      id: 'incomplete',
      formatVersion: 1,
      closedAt: new Date().toISOString(),
      state: createMatch(),
    },
  ];
  const transaction = database.transaction(CLOSED_STORE, 'readwrite');
  records.forEach((record) => transaction.objectStore(CLOSED_STORE).put(record));
  const matches = await listStoredMatches(database);
  assert.equal(matches.length, 4);
  assert.deepEqual(readableArchive(matches[0]).state, state);
  assert.equal(matches.filter((match) => match.unavailable).length, 3);
  for (const record of records)
    assert.deepEqual(await storedValue(database, CLOSED_STORE, record.id), record);
});

test('history read failures reject and a later read can retry without data loss', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = closedSet();
  await saveStoredMatch(database, state);
  await closeStoredMatch(database, state, { id: 'preserved' });
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(listStoredMatches(database));
  database.transaction = original;
  assert.equal((await listStoredMatches(database))[0].id, 'preserved');
});
