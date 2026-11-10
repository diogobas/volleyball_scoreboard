import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, matchReducer, matchPlayerStats, restoreMatch } from './match.js';
import {
  assignMatchPlayers,
  DEVELOPMENT_GROUP_ID,
  listPlayers,
  loadDevelopmentGroup,
  normalizeName,
  registerPlayer,
} from './registry.js';
import {
  ACTIVE_STORE,
  CLOSED_STORE,
  PLAYER_STORE,
  GROUP_STORE,
  SETTINGS_STORE,
  closeStoredMatch,
  createLocalId,
  listStoredMatches,
  loadStoredMatch,
  openMatchDatabase,
  saveStoredMatch,
  transactionDone,
} from './storage.js';
import {
  cacheAuthorizedGroups,
  cacheRemoteRegistry,
  cachedAdmin,
  linkDevelopmentData,
  registryCache,
  renamePendingPlayer,
  resolvePlayerIdentity,
  setRegistryIdentity,
} from './registryCache.js';
import {
  prepareRegistry,
  refreshRegistryGroups,
  registrySession,
  synchronizePlayers,
} from '../remote/playerRegistry.js';

const owner = '11111111-1111-4111-8111-111111111111';
const online = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Online group',
  time_zone: 'America/Toronto',
};
const point = (state) => matchReducer(state, { type: 'point', team: 'A', playerId: 'p1' });
const close = (state) => matchReducer(state, { type: 'closeSet' });

function server() {
  const players = [];
  const state = { players, allowed: true, lostReply: false, uploads: 0, snapshots: 0 };
  state.client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
    rpc: async (name, args) => {
      if (name === 'list_my_groups') return { data: state.allowed ? [online] : [], error: null };
      if (!state.allowed)
        return { data: null, error: { code: '42501', message: 'Not authorized' } };
      if (name === 'get_group_registry') {
        state.snapshots++;
        return { data: structuredClone({ group: online, players }), error: null };
      }
      assert.equal(name, 'sync_group_player');
      assert.equal(args.p_group_id, online.id);
      state.uploads++;
      let existing = players.find((player) => player.id === args.p_player_id);
      if (existing)
        return {
          data: {
            status:
              normalizeName(existing.name) === normalizeName(args.p_name)
                ? 'saved'
                : 'identity_conflict',
            player: structuredClone(existing),
          },
          error: null,
        };
      existing = players.find(
        (player) => normalizeName(player.name) === normalizeName(args.p_name),
      );
      if (existing)
        return {
          data: { status: 'name_conflict', player: structuredClone(existing) },
          error: null,
        };
      const player = { id: args.p_player_id, group_id: online.id, name: args.p_name };
      players.push(player);
      if (state.lostReply) {
        state.lostReply = false;
        throw new Error('Response lost');
      }
      return { data: { status: 'saved', player: structuredClone(player) }, error: null };
    },
  };
  return state;
}

async function device(t) {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  await loadDevelopmentGroup(database);
  await loadStoredMatch(database, () => null);
  return database;
}

async function devMatch(database) {
  const players = [];
  const state = createMatch();
  const teams = structuredClone(state.teams);
  for (const team of ['A', 'B'])
    for (let i = 0; i < 6; i++) {
      const player = await registerPlayer(database, DEVELOPMENT_GROUP_ID, `${team} Player ${i}`);
      players.push(player);
      teams[team].players[i].personId = player.id;
    }
  const match = close(point(assignMatchPlayers(state, DEVELOPMENT_GROUP_ID, teams, players)));
  await saveStoredMatch(database, match);
  return { match, players };
}

test('v2 cache upgrades to v3 without losing data and permits pending/remote namesakes to coexist', async (t) => {
  const factory = new IDBFactory();
  const old = await new Promise((resolve) => {
    const request = factory.open('volleyball-scoreboard', 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ACTIVE_STORE);
      request.result.createObjectStore(CLOSED_STORE, { keyPath: 'id' });
      request.result.createObjectStore(GROUP_STORE, { keyPath: 'id' });
      const players = request.result.createObjectStore(PLAYER_STORE, { keyPath: 'id' });
      players.createIndex('groupId', 'groupId');
      players.createIndex('groupName', ['groupId', 'normalizedName'], { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = old.transaction(ACTIVE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const state = point(createMatch());
  transaction.objectStore(ACTIVE_STORE).put({ formatVersion: 1, state }, 'current');
  await done;
  old.close();
  const database = await openMatchDatabase(factory);
  t.after(() => database.close());
  assert.equal(database.version, 3);
  assert.ok(database.objectStoreNames.contains(SETTINGS_STORE));
  assert.deepEqual(await loadStoredMatch(database), state);
  assert.equal(
    database.transaction(PLAYER_STORE).objectStore(PLAYER_STORE).index('groupName').unique,
    false,
  );
});

test('explicit development link preserves all match data and IDs while stale writes stay linked', async (t) => {
  const database = await device(t);
  const { match, players } = await devMatch(database);
  await closeStoredMatch(database, match, { id: 'previous' });
  await saveStoredMatch(database, match);
  await cacheAuthorizedGroups(database, owner, [online]);
  const updated = await linkDevelopmentData(database, online.id);
  assert.equal(updated.groupId, online.id);
  assert.deepEqual(updated.log, match.log);
  assert.deepEqual(updated.teams, match.teams);
  assert.equal((await listStoredMatches(database))[0].state.groupId, online.id);
  assert.deepEqual(
    (await listPlayers(database, online.id)).map((p) => p.id).sort(),
    players.map((p) => p.id).sort(),
  );
  await saveStoredMatch(database, match);
  assert.equal((await loadStoredMatch(database)).groupId, online.id);
  const next = await closeStoredMatch(database, match, { id: 'after-link' });
  assert.equal(next.groupId, online.id);
  assert.equal(
    (await registryCache(database)).groups.find((g) => g.id === DEVELOPMENT_GROUP_ID).linkedTo,
    online.id,
  );
  await assert.rejects(linkDevelopmentData(database, createLocalId()));
});

test('failed link is atomic and never drops archived matches or player records', async (t) => {
  const database = await device(t);
  const { match } = await devMatch(database);
  await cacheAuthorizedGroups(database, owner, [online]);
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(linkDevelopmentData(database, online.id));
  database.transaction = original;
  assert.deepEqual(await loadStoredMatch(database), match);
  assert.equal((await listPlayers(database, DEVELOPMENT_GROUP_ID)).length, 12);
  assert.equal(
    (await registryCache(database)).groups.find((g) => g.id === DEVELOPMENT_GROUP_ID).linkedTo,
    undefined,
  );
});

test('player uploads are serialized and recover a lost response without duplicating the server record', async (t) => {
  const database = await device(t);
  await cacheAuthorizedGroups(database, owner, [online]);
  await registerPlayer(database, online.id, 'João');
  const remote = server();
  remote.lostReply = true;
  const first = await synchronizePlayers(database, online.id, remote.client);
  assert.equal(first.pending, 1);
  assert.equal(first.error, 'Response lost');
  assert.equal(remote.players.length, 1);
  const [a, b] = await Promise.all([
    synchronizePlayers(database, online.id, remote.client),
    synchronizePlayers(database, online.id, remote.client),
  ]);
  assert.equal(a.pending, 0);
  assert.equal(b.pending, 0);
  assert.equal(remote.uploads, 1);
  assert.equal(remote.players.length, 1);
  assert.equal((await listPlayers(database, online.id))[0].syncStatus, 'synced');
});

test('same-person resolution rewrites point authors, set rosters and current/archived IDs without changing points/names', async (t) => {
  const database = await device(t);
  const { match, players } = await devMatch(database);
  await closeStoredMatch(database, match, { id: 'old' });
  await saveStoredMatch(database, match);
  await cacheAuthorizedGroups(database, owner, [online]);
  await linkDevelopmentData(database, online.id);
  const remoteId = createLocalId();
  const response = {
    group: online,
    players: [{ id: remoteId, group_id: online.id, name: players[0].name }],
  };
  await cacheRemoteRegistry(database, owner, response);
  assert.equal(
    (await registryCache(database)).players.find((p) => p.id === players[0].id).syncStatus,
    'conflict',
  );
  const before = await loadStoredMatch(database);
  await assert.rejects(
    resolvePlayerIdentity(database, players[0].id, createLocalId()),
    /conflict changed/,
  );
  assert.deepEqual(await loadStoredMatch(database), before);
  assert.equal(
    (await registryCache(database)).players.find((p) => p.id === players[0].id).canonicalId,
    undefined,
  );
  const updated = await resolvePlayerIdentity(database, players[0].id, remoteId);
  assert.equal(updated.teams.A.players[0].personId, remoteId);
  assert.equal(updated.log[0].personId, remoteId);
  assert.equal(updated.log.at(-1).rosters.A[0].personId, remoteId);
  assert.equal(updated.teams.A.players[0].matchPoints, 1);
  assert.equal(updated.log[0].playerName, before.log[0].playerName);
  assert.equal((await listStoredMatches(database))[0].state.log[0].personId, remoteId);
  assert.equal(
    (await listPlayers(database, online.id)).some((p) => p.id === players[0].id),
    false,
  );
  await saveStoredMatch(database, before);
  assert.equal((await loadStoredMatch(database)).log[0].personId, remoteId);
  assert.deepEqual(restoreMatch(JSON.stringify(updated)), updated);
  assert.equal(matchPlayerStats(updated).find((p) => p.personId === remoteId).matchPoints, 1);
});

test('switching accounts updates offline identity even when membership refresh fails', async (t) => {
  const database = await device(t);
  await cacheAuthorizedGroups(database, owner, [online]);
  const secondUser = createLocalId();
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: secondUser } } } }) },
    rpc: async () => {
      throw new Error('Connection interrupted');
    },
  };
  const result = await prepareRegistry(database, online.id, client);
  assert.equal(result.cache.userId, secondUser);
  assert.equal(
    cachedAdmin(
      result.cache,
      result.cache.groups.find((group) => group.id === online.id),
    ),
    false,
  );
  assert.equal(result.error, 'Connection interrupted');
  assert.ok(
    result.cache.groups.find((group) => group.id === online.id).adminUserIds.includes(owner),
  );
});

test('different-person resolution keeps the UUID and historical points, then uploads a distinct name', async (t) => {
  const database = await device(t);
  const { players } = await devMatch(database);
  await cacheAuthorizedGroups(database, owner, [online]);
  await linkDevelopmentData(database, online.id);
  const remote = server();
  remote.players.push({ id: createLocalId(), group_id: online.id, name: players[0].name });
  await synchronizePlayers(database, online.id, remote.client);
  const old = await loadStoredMatch(database);
  await renamePendingPlayer(database, players[0].id, 'Another Surname');
  const result = await synchronizePlayers(database, online.id, remote.client);
  assert.equal(result.conflicts, 0);
  assert.equal(remote.players.find((p) => p.id === players[0].id).name, 'Another Surname');
  assert.deepEqual(await loadStoredMatch(database), old);
});

test('a merge that would duplicate one person in the same set rolls back all identities', async (t) => {
  const database = await device(t);
  const { match, players } = await devMatch(database);
  await cacheAuthorizedGroups(database, owner, [online]);
  await linkDevelopmentData(database, online.id);
  await cacheRemoteRegistry(database, owner, {
    group: online,
    players: [{ id: players[1].id, group_id: online.id, name: players[0].name }],
  });
  const before = await loadStoredMatch(database);
  await assert.rejects(resolvePlayerIdentity(database, players[0].id), /identity/);
  assert.deepEqual(await loadStoredMatch(database), before);
  assert.equal(
    (await registryCache(database)).players.find((p) => p.id === players[0].id).canonicalId,
    undefined,
  );
  assert.equal(before.teams.A.players[0].matchPoints, match.teams.A.players[0].matchPoints);
});

test('refresh and revoked access preserve pending players; offline session fallback and sign-out stay scoped', async (t) => {
  const database = await device(t);
  await cacheAuthorizedGroups(database, owner, [online]);
  const pending = await registerPlayer(database, online.id, 'Offline Player');
  const remote = server();
  const prepared = await prepareRegistry(database, online.id, remote.client);
  assert.equal(prepared.cache.userId, owner);
  assert.equal(remote.snapshots, 1);
  remote.client.auth.getSession = async () => {
    throw new TypeError('Offline');
  };
  const offline = await registrySession(database, remote.client);
  assert.equal(offline.userId, owner);
  assert.equal(offline.session, null);
  assert.equal((await listPlayers(database, online.id))[0].id, pending.id);
  remote.client.auth.getSession = async () => ({
    data: { session: { user: { id: owner } } },
    error: null,
  });
  remote.allowed = false;
  await refreshRegistryGroups(database, await registrySession(database, remote.client));
  const cache = await registryCache(database);
  assert.equal(
    cachedAdmin(
      cache,
      cache.groups.find((g) => g.id === online.id),
    ),
    false,
  );
  await assert.rejects(synchronizePlayers(database, online.id, remote.client), /not authorized/);
  assert.equal((await listPlayers(database, online.id)).length, 1);
  await setRegistryIdentity(database, null);
  assert.equal((await registryCache(database)).userId, null);
});

test('two independent devices detect a concurrent namesake and require an explicit choice', async (t) => {
  const first = await device(t);
  const second = await device(t);
  for (const database of [first, second]) {
    await cacheAuthorizedGroups(database, owner, [online]);
    await registerPlayer(database, online.id, 'João');
  }
  const remote = server();
  await synchronizePlayers(first, online.id, remote.client);
  const result = await synchronizePlayers(second, online.id, remote.client);
  assert.equal(result.conflicts, 1);
  assert.equal(remote.players.length, 1);
  const pending = (await registryCache(second)).players.find((p) => p.syncStatus === 'conflict');
  await resolvePlayerIdentity(second, pending.id);
  assert.equal((await listPlayers(second, online.id)).length, 1);
  assert.equal((await listPlayers(second, online.id))[0].id, remote.players[0].id);
});

test('identity reconciliation includes the initial lineup and both sides of every roster-change event', async (t) => {
  const database = await device(t);
  const { match, players } = await devMatch(database);
  const teams = structuredClone(match.teams);
  [teams.A.players[0].personId, teams.B.players[0].personId] = [
    teams.B.players[0].personId,
    teams.A.players[0].personId,
  ];
  const swapped = assignMatchPlayers(match, DEVELOPMENT_GROUP_ID, teams, players);
  const played = close(point(swapped));
  await saveStoredMatch(database, played);
  await cacheAuthorizedGroups(database, owner, [online]);
  await linkDevelopmentData(database, online.id);
  const remoteId = createLocalId();
  await cacheRemoteRegistry(database, owner, {
    group: online,
    players: [{ id: remoteId, group_id: online.id, name: players[0].name }],
  });
  const updated = await resolvePlayerIdentity(database, players[0].id);
  assert.equal(updated.initialRoster.A[0].personId, remoteId);
  const change = updated.log.find((entry) => entry.type === 'roster');
  assert.equal(change.previousRosters.A[0].personId, remoteId);
  assert.equal(change.rosters.B[0].personId, remoteId);
  assert.equal(updated.teams.B.players[0].personId, remoteId);
  assert.deepEqual(restoreMatch(JSON.stringify(updated)), updated);
  const undone = matchReducer(
    matchReducer(matchReducer(updated, { type: 'undo' }), { type: 'undo' }),
    { type: 'undo' },
  );
  assert.equal(undone.teams.A.players[0].personId, remoteId);
});

test('a response arriving after the account changed cannot authorize a cache for the old account', async (t) => {
  const database = await device(t);
  const remote = server();
  let calls = 0;
  remote.client.auth.getSession = async () => ({
    data: { session: { user: { id: calls++ ? 'changed-account' : owner } } },
    error: null,
  });
  const prepared = await prepareRegistry(database, online.id, remote.client);
  assert.match(prepared.error, /account changed/);
  assert.equal(
    prepared.cache.groups.some((group) => group.id === online.id),
    false,
  );
});

test('registry refresh carries category and removes deleted identities without affecting other groups', async (t) => {
  const database = await device(t);
  await cacheAuthorizedGroups(database, owner, [online]);
  const oldId = createLocalId();
  const activeId = createLocalId();
  const snapshot = {
    group: online,
    players: [
      { id: oldId, group_id: online.id, name: 'Removed player', category: 'fixed' },
      { id: activeId, group_id: online.id, name: 'Current player', category: 'sub' },
    ],
  };
  await cacheRemoteRegistry(database, owner, snapshot);
  assert.equal(
    (await listPlayers(database, online.id)).find((player) => player.id === oldId).category,
    'fixed',
  );
  await cacheRemoteRegistry(database, owner, {
    ...snapshot,
    players: [{ ...snapshot.players[1], name: 'Renamed player', category: 'fixed' }],
    deleted_player_ids: [oldId],
  });
  const players = await listPlayers(database, online.id);
  assert.equal(players.length, 1);
  assert.equal(players[0].name, 'Renamed player');
  assert.equal(players[0].category, 'fixed');
});
