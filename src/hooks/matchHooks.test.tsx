import './testEnvironment';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, enableCourtMode, matchReducer } from '../game/match';
import {
  closeStoredMatch,
  listStoredMatches,
  loadStoredMatch,
  openMatchDatabase,
  saveStoredMatch,
} from '../game/storage';
import { closeDayDatabaseWhenUploadsFinish } from '../remote/gameDays';
import { useMatchSession } from './useMatchSession';
import type { MatchSessionServices } from './useMatchSession';
import { useMatchController } from './useMatchController';
import type { MatchControllerServices } from './useMatchController';
import { useSavedMatches } from './useSavedMatches';
import type { SavedMatchesServices } from './useSavedMatches';
import { useOnlineStatus } from './useOnlineStatus';
import type { DayContext, MatchState, StoredMatch } from '../game/types';

const connections: IDBDatabase[] = [];
afterEach(() => {
  cleanup();
  connections.splice(0).forEach((database) => database.close());
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const openDatabase = async (factory = new IDBFactory()) => {
  const database = await openMatchDatabase(factory);
  connections.push(database);
  return database;
};

const load = (database: IDBDatabase) => loadStoredMatch(database, () => null);
const closedState = () =>
  matchReducer(
    matchReducer(enableCourtMode(createMatch()), {
      type: 'point',
      team: 'A',
      playerId: 'p1',
    }),
    { type: 'closeSet' },
  );

test('Strict Mode initializes independent connections and closes each one exactly once', async () => {
  const factory = new IDBFactory();
  const opened: IDBDatabase[] = [];
  const closed: IDBDatabase[] = [];
  const dependencies: MatchSessionServices = {
    open: async () => {
      const database = await openDatabase(factory);
      opened.push(database);
      return database;
    },
    load,
    close: async (database) => {
      closed.push(database);
      await closeDayDatabaseWhenUploadsFinish(database);
    },
  };
  const { result, unmount } = renderHook(() => useMatchSession(dependencies), {
    reactStrictMode: true,
  });
  await waitFor(() => assert.ok(result.current.session));
  await waitFor(() => assert.equal(opened.length, 2));
  await waitFor(() => assert.equal(closed.length, 1));
  const active = result.current.session!.database;
  assert.notEqual(closed[0], active);
  assert.doesNotThrow(() => active.transaction('activeMatches'));
  unmount();
  await waitFor(() => assert.equal(closed.length, 2));
  assert.equal(new Set(closed).size, 2);
});

test('session retries a failed restore without replacing the existing saved match', async () => {
  const factory = new IDBFactory();
  const seed = await openDatabase(factory);
  const original = matchReducer(await load(seed), { type: 'point', team: 'B', playerId: 'p2' });
  await saveStoredMatch(seed, original);
  let failed = true;
  const dependencies: MatchSessionServices = {
    open: () => openDatabase(factory),
    load: async (database) => {
      if (failed) throw new Error('Temporary failure');
      return load(database);
    },
    close: closeDayDatabaseWhenUploadsFinish,
  };
  const { result } = renderHook(() => useMatchSession(dependencies));
  await waitFor(() => assert.equal(result.current.error, true));
  assert.deepEqual(await load(seed), original);
  failed = false;
  act(() => result.current.retry());
  await waitFor(() => assert.ok(result.current.session));
  assert.equal(result.current.error, false);
  assert.deepEqual(result.current.session!.state.log, original.log);
});

test('unmount during restore waits for the read before closing and discards its result', async () => {
  const database = await openDatabase();
  const restored = deferred<MatchState>();
  let loads = 0;
  let closes = 0;
  const dependencies: MatchSessionServices = {
    open: async () => database,
    load: () => {
      loads++;
      return restored.promise;
    },
    close: async (db) => {
      closes++;
      db.close();
    },
  };
  const { unmount } = renderHook(() => useMatchSession(dependencies));
  await waitFor(() => assert.equal(loads, 1));
  unmount();
  assert.equal(closes, 0);
  await act(async () => restored.resolve(createMatch()));
  assert.equal(closes, 1);
});

test('session teardown delegates database closure until the upload barrier completes', async () => {
  const database = await openDatabase();
  const uploads = deferred<void>();
  let waiting = false;
  const dependencies: MatchSessionServices = {
    open: async () => database,
    load,
    close: async (db) => {
      waiting = true;
      await uploads.promise;
      db.close();
    },
  };
  const { result, unmount } = renderHook(() => useMatchSession(dependencies));
  await waitFor(() => assert.ok(result.current.session));
  unmount();
  assert.equal(waiting, true);
  assert.doesNotThrow(() => database.transaction('activeMatches'));
  await act(async () => uploads.resolve());
  assert.throws(() => database.transaction('activeMatches'));
});

test('controller persists points and Undo in Strict Mode using the real local database', async () => {
  const database = await openDatabase();
  const initial = enableCourtMode(await load(database));
  const { result } = renderHook(() => useMatchController(database, initial), {
    reactStrictMode: true,
  });
  act(() => result.current.dispatch({ type: 'point', team: 'A', playerId: 'p1' }));
  await waitFor(() => assert.equal(result.current.saved, true));
  const persisted = await load(database);
  assert.equal(persisted.teams.A.players[0].matchPoints, 1);
  assert.ok(persisted.startedAt);
  act(() => result.current.dispatch({ type: 'undo' }));
  await waitFor(() => assert.equal(result.current.saved, true));
  assert.equal((await load(database)).log.length, 0);
});

test('a failed autosave preserves current points and retry saves the same snapshot', async () => {
  const database = await openDatabase();
  const initial = await load(database);
  let fail = true;
  const dependencies: MatchControllerServices = {
    save: async (db, state) => {
      if (fail) throw new Error('Storage unavailable');
      return saveStoredMatch(db, state);
    },
    close: closeStoredMatch,
    createId: () => 'unused',
  };
  const { result } = renderHook(() => useMatchController(database, initial, dependencies));
  act(() => result.current.dispatch({ type: 'point', team: 'A', playerId: 'p1' }));
  await waitFor(() => assert.ok(result.current.storageWarning));
  assert.equal(result.current.state.log.length, 1);
  assert.equal(result.current.saved, false);
  assert.equal((await load(database)).log.length, 0);
  fail = false;
  act(() => result.current.retrySave());
  await waitFor(() => assert.equal(result.current.saved, true));
  assert.equal(result.current.storageWarning, '');
  assert.deepEqual((await load(database)).log, result.current.state.log);
});

test('an older canonical save cannot roll back a newer score', async () => {
  const database = await openDatabase();
  const initial = await load(database);
  const requests: { state: MatchState; resolve: (state: MatchState) => void }[] = [];
  const dependencies: MatchControllerServices = {
    save: async (_db, state) => {
      if (!state.log.length) return state;
      const request = deferred<MatchState>();
      requests.push({ state, resolve: request.resolve });
      return request.promise;
    },
    close: closeStoredMatch,
    createId: () => 'unused',
  };
  const { result } = renderHook(() => useMatchController(database, initial, dependencies));
  act(() => result.current.dispatch({ type: 'point', team: 'A', playerId: 'p1' }));
  act(() => result.current.dispatch({ type: 'point', team: 'B', playerId: 'p1' }));
  assert.equal(requests.length, 2);
  await act(async () => requests[0].resolve(structuredClone(requests[0].state)));
  assert.equal(result.current.state.log.length, 2);
  assert.equal(result.current.saved, false);
  await act(async () => requests[1].resolve(requests[1].state));
  assert.equal(result.current.saved, true);
});

test('closing blocks duplicate closures, point actions and retry saves until the transaction completes', async () => {
  const database = await openDatabase();
  const initial = closedState();
  await saveStoredMatch(database, initial);
  const closing = deferred<MatchState>();
  let closes = 0;
  let saves = 0;
  const dependencies: MatchControllerServices = {
    save: async (_db, state) => {
      saves++;
      return state;
    },
    close: async () => {
      closes++;
      return closing.promise;
    },
    createId: () => 'closure-id',
  };
  const { result } = renderHook(() => useMatchController(database, initial, dependencies));
  await act(async () => {});
  const before = saves;
  let first!: ReturnType<typeof result.current.finishMatch>;
  await act(async () => {
    first = result.current.finishMatch();
    assert.equal(await result.current.finishMatch(), undefined);
    result.current.dispatch({ type: 'point', team: 'A', playerId: 'p1' });
    result.current.retrySave();
  });
  assert.equal(result.current.closingMatch, true);
  assert.equal(closes, 1);
  assert.equal(saves, before);
  assert.equal(result.current.state, initial);
  await act(async () => {
    closing.resolve(matchReducer(initial, { type: 'reset' }));
    await first;
  });
  assert.equal(result.current.closingMatch, false);
  assert.equal(result.current.closeSuccess, true);
  assert.equal(result.current.state.log.length, 0);
});

test('failed closure keeps the active match and releases the lock for retry', async () => {
  const database = await openDatabase();
  const initial = closedState();
  await saveStoredMatch(database, initial);
  let fail = true;
  const dependencies: MatchControllerServices = {
    save: saveStoredMatch,
    close: async (db, state, options) => {
      if (fail) throw new Error('Disk full');
      return closeStoredMatch(db, state, options);
    },
    createId: () => '11111111-1111-4111-8111-111111111111',
  };
  const { result } = renderHook(() => useMatchController(database, initial, dependencies));
  await act(async () => {
    await result.current.finishMatch();
  });
  assert.equal(result.current.state, initial);
  assert.match(result.current.closeError, /Disk full/);
  assert.equal(result.current.closingMatch, false);
  fail = false;
  await act(async () => {
    await result.current.finishMatch();
  });
  assert.equal(result.current.closeError, '');
  assert.equal(result.current.state.log.length, 0);
  const archives = await listStoredMatches(database);
  assert.equal(archives.length, 1);
  assert.equal(archives[0].unavailable, undefined);
  if (!archives[0].unavailable) assert.deepEqual(archives[0].state.log, initial.log);
});

const context: DayContext = {
  code: 'AB7K9',
  day_id: '22222222-2222-4222-8222-222222222222',
  group_id: '33333333-3333-4333-8333-333333333333',
  group_name: 'Hook test',
  play_date: '2026-11-10',
  lineup_version: 1,
  lineup: { A: { name: 'Home', players: [] }, B: { name: 'Away', players: [] } },
};
context.lineup.A.players = Array.from({ length: 6 }, (_, i) => ({
  id: `a${i}`,
  name: `Home ${i + 1}`,
}));
context.lineup.B.players = Array.from({ length: 6 }, (_, i) => ({
  id: `b${i}`,
  name: `Away ${i + 1}`,
}));

test('lineup import commits before exposing the new names; failed writes keep the original state', async () => {
  const database = await openDatabase();
  const initial = enableCourtMode(await load(database));
  let fail = true;
  const dependencies: MatchControllerServices = {
    save: async (db, state) => {
      if (fail && state.dayContext) throw new Error('Write denied');
      return saveStoredMatch(db, state);
    },
    close: closeStoredMatch,
    createId: () => 'unused',
  };
  const { result } = renderHook(() => useMatchController(database, initial, dependencies));
  await act(async () => assert.rejects(result.current.loadLineup(context), /Write denied/));
  assert.equal(result.current.state, initial);
  assert.equal(result.current.setupDismissed, false);
  fail = false;
  await act(async () => result.current.loadLineup(context));
  assert.equal(result.current.state.teams.A.players[0].name, 'Home 1');
  assert.equal(result.current.setupDismissed, true);
  await act(async () => {
    assert.deepEqual((await load(database)).dayContext, context);
  });
  act(() => result.current.dispatch({ type: 'reset' }));
  assert.equal(result.current.setupDismissed, false);
  act(() => result.current.playIndependently());
  assert.equal(result.current.state.dayContext, undefined);
  assert.equal(result.current.setupDismissed, true);
  await act(async () => {
    await load(database);
  });
});

test('saved-match hook reports failed uploads and retains the pending match until a confirmed retry', async () => {
  const database = await openDatabase();
  await saveStoredMatch(database, closedState());
  await closeStoredMatch(database, closedState(), { id: 'archive' });
  let fail = true;
  const dependencies: SavedMatchesServices = {
    list: listStoredMatches,
    upload: async () => {
      if (fail) throw new Error('Network unavailable');
      return { status: 'received', published: true };
    },
  };
  const { result } = renderHook(() => useSavedMatches(database, dependencies));
  await waitFor(() => assert.equal(result.current.pendingCount, 1));
  await act(async () => {
    assert.equal(await result.current.sendClosedMatch('archive'), undefined);
  });
  assert.match(result.current.syncNotice, /kept on this device.*Network unavailable/);
  assert.equal((await listStoredMatches(database)).length, 1);
  fail = false;
  await act(async () => {
    assert.equal((await result.current.sendClosedMatch('archive'))?.status, 'received');
  });
  assert.match(result.current.syncNotice, /Match finalized and synced/);
});

test('saved-match load failures surface a notice and refresh recovers the pending count', async () => {
  const database = await openDatabase();
  let fail = true;
  const dependencies: SavedMatchesServices = {
    list: async () => {
      if (fail) throw new Error('Read denied');
      return [{ id: 'unreadable', unavailable: true }];
    },
    upload: async () => ({ status: 'not_local' }),
  };
  const { result } = renderHook(() => useSavedMatches(database, dependencies));
  await waitFor(() => assert.match(result.current.syncNotice, /could not be loaded/));
  fail = false;
  await act(async () => result.current.refreshPending());
  assert.equal(result.current.pendingCount, 1);
});

test('stale pending-count requests cannot overwrite results for a new database', async () => {
  const first = await openDatabase();
  const second = await openDatabase();
  const old = deferred<StoredMatch[]>();
  const dependencies: SavedMatchesServices = {
    list: async (db) => (db === first ? old.promise : []),
    upload: async () => ({ status: 'not_local' }),
  };
  const { result, rerender } = renderHook(
    ({ database }) => useSavedMatches(database, dependencies),
    { initialProps: { database: first } },
  );
  rerender({ database: second });
  await act(async () => {});
  await act(async () => old.resolve([{ id: 'old', unavailable: true }]));
  assert.equal(result.current.pendingCount, 0);
});

test('online-status hook follows connection events and removes both listeners on unmount', (t) => {
  const removed = t.mock.method(window, 'removeEventListener');
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  let online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  try {
    const { result, unmount } = renderHook(() => useOnlineStatus());
    assert.equal(result.current, true);
    act(() => {
      online = false;
      window.dispatchEvent(new window.Event('offline'));
    });
    assert.equal(result.current, false);
    act(() => {
      online = true;
      window.dispatchEvent(new window.Event('online'));
    });
    assert.equal(result.current, true);
    unmount();
    assert.deepEqual(removed.mock.calls.map(({ arguments: args }) => args[0]).sort(), [
      'offline',
      'online',
    ]);
    online = false;
    window.dispatchEvent(new window.Event('offline'));
    assert.equal(result.current, true);
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'onLine', descriptor);
    else Reflect.deleteProperty(navigator, 'onLine');
  }
});
