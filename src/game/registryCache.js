import { ACTIVE_STORE, CLOSED_STORE, GROUP_STORE, PLAYER_STORE, SETTINGS_STORE, transactionDone } from './storage.js';
import { DEVELOPMENT_GROUP_ID, normalizeName } from './registry.js';
import { canonicalMatch } from './identity.js';

export async function registryCache(database) {
  const transaction = database.transaction([GROUP_STORE, PLAYER_STORE, SETTINGS_STORE], 'readonly');
  const done = transactionDone(transaction);
  const groups = transaction.objectStore(GROUP_STORE).getAll();
  const players = transaction.objectStore(PLAYER_STORE).getAll();
  const identity = transaction.objectStore(SETTINGS_STORE).get('identity');
  const selected = transaction.objectStore(SETTINGS_STORE).get('selectedGroup');
  await done;
  return { groups: groups.result, players: players.result, userId: identity.result ?? null, selectedGroupId: selected.result ?? DEVELOPMENT_GROUP_ID };
}

export async function setRegistryIdentity(database, userId) {
  const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(SETTINGS_STORE).put(userId, 'identity');
  await done;
}

export async function selectRegistryGroup(database, id) {
  const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(SETTINGS_STORE).put(id, 'selectedGroup');
  await done;
}

export async function forgetRegistryAccess(database, userId, groupId) {
  const transaction = database.transaction(GROUP_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(GROUP_STORE);
  const request = store.get(groupId);
  request.onsuccess = () => {
    if (request.result) store.put({ ...request.result, adminUserIds: (request.result.adminUserIds ?? []).filter(id => id !== userId) });
  };
  await done;
}

export async function cacheAuthorizedGroups(database, userId, rows) {
  const transaction = database.transaction([GROUP_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(GROUP_STORE);
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result;
    for (const group of existing.filter(group => !group.localOnly)) {
      store.put({ ...group, adminUserIds: (group.adminUserIds ?? []).filter(id => id !== userId) });
    }
    for (const group of rows) {
      const previous = existing.find(item => item.id === group.id);
      store.put({ ...previous, id: group.id, name: group.name, timeZone: group.time_zone, localOnly: false,
        adminUserIds: [...new Set([...(previous?.adminUserIds ?? []), userId])],
      });
    }
    transaction.objectStore(SETTINGS_STORE).put(userId, 'identity');
  };
  await done;
}

export const cachedAdmin = (cache, group) => group?.localOnly || Boolean(cache.userId && group?.adminUserIds?.includes(cache.userId));
export const fromRemotePlayer = row => ({ id: row.id, groupId: row.group_id, name: row.name,
  normalizedName: normalizeName(row.name), category: row.category ?? 'sub', syncStatus: 'synced' });

export async function cacheRemoteRegistry(database, userId, response) {
  const { group, players, deleted_player_ids = [] } = response;
  if (!group?.id || !Array.isArray(players) || !Array.isArray(deleted_player_ids) || deleted_player_ids.some(id => typeof id !== 'string') || players.some(player => player.group_id !== group.id || !player.id || typeof player.name !== 'string')) {
    throw new Error('Invalid player registry response. Cached data has been kept.');
  }
  await cacheAuthorizedGroupsForSnapshot(database, userId, group, players, deleted_player_ids);
}

async function cacheAuthorizedGroupsForSnapshot(database, userId, group, remotePlayers, deletedPlayerIds = []) {
  const transaction = database.transaction([GROUP_STORE, PLAYER_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  let failure;
  const store = transaction.objectStore(PLAYER_STORE);
  const request = store.getAll();
  request.onsuccess = () => {
    try {
      const all = request.result;
      const local = all.filter(player => player.groupId === group.id);
      const deleted = new Set(deletedPlayerIds);
      for (const player of local) if (deleted.has(player.id)) store.delete(player.id);
      const remote = remotePlayers.map(fromRemotePlayer);
      for (const player of remote) {
        const previous = all.find(item => item.id === player.id);
        if (previous && previous.groupId !== group.id) throw new Error('A player ID is cached in another group. Link development data first.');
        if (previous?.canonicalId) continue;
        if (previous && previous.syncStatus !== 'synced' && previous.normalizedName !== player.normalizedName) {
          store.put({ ...previous, syncStatus: 'conflict', remotePlayer: player, conflictType: 'identity' });
        } else store.put(player);
      }
      for (const player of local.filter(item => !item.canonicalId && !deleted.has(item.id) && item.syncStatus !== 'synced')) {
        if (remote.some(item => item.id === player.id)) continue;
        const conflict = remote.find(item => item.normalizedName === player.normalizedName ||
          (!player.normalizedName.includes(' ') && item.normalizedName.split(' ')[0] === player.normalizedName));
        if (conflict) store.put({ ...player, syncStatus: 'conflict', remotePlayer: conflict, conflictType: 'name' });
      }
      const groups = transaction.objectStore(GROUP_STORE);
      const previousGroup = groups.get(group.id);
      previousGroup.onsuccess = () => groups.put({ ...previousGroup.result, id: group.id, name: group.name,
        timeZone: group.time_zone, localOnly: false, lastSyncedAt: new Date().toISOString(),
        adminUserIds: [...new Set([...(previousGroup.result?.adminUserIds ?? []), userId])],
      });
      transaction.objectStore(SETTINGS_STORE).put(userId, 'identity');
    } catch (error) { failure = error; transaction.abort(); }
  };
  try { await done; } catch (error) { throw failure ?? error; }
}

// Registry reconciliation and every affected match are committed together.
async function changeIdentities(database, transform) {
  const transaction = database.transaction([GROUP_STORE, PLAYER_STORE, ACTIVE_STORE, CLOSED_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const groups = transaction.objectStore(GROUP_STORE).getAll();
  const players = transaction.objectStore(PLAYER_STORE).getAll();
  const active = transaction.objectStore(ACTIVE_STORE).get('current');
  const archives = transaction.objectStore(CLOSED_STORE).getAll();
  const identity = transaction.objectStore(SETTINGS_STORE).get('identity');
  let result;
  let failure;
  identity.onsuccess = () => {
    try {
      const cache = { groups: groups.result, players: players.result, userId: identity.result };
      const selected = transform(cache);
      result = active.result ? canonicalMatch(active.result.state, cache.groups, cache.players) : null;
      const updated = archives.result.map(archive => archive.state ? { ...archive,
        state: canonicalMatch(archive.state, cache.groups, cache.players),
      } : archive);
      for (const group of cache.groups) transaction.objectStore(GROUP_STORE).put(group);
      for (const player of cache.players) transaction.objectStore(PLAYER_STORE).put(player);
      if (active.result) transaction.objectStore(ACTIVE_STORE).put({ ...active.result, state: result }, 'current');
      updated.forEach(archive => transaction.objectStore(CLOSED_STORE).put(archive));
      if (selected) transaction.objectStore(SETTINGS_STORE).put(selected, 'selectedGroup');
    } catch (error) { failure = error; transaction.abort(); }
  };
  try { await done; } catch (error) { throw failure ?? error; }
  return result;
}

function requireAdmin(cache, groupId) {
  const group = cache.groups.find(item => item.id === groupId);
  if (!group || !cachedAdmin(cache, group)) throw new Error('Sign in and refresh your group access before editing this registry.');
  return group;
}

export async function linkDevelopmentData(database, targetId) {
  return changeIdentities(database, cache => {
    const target = requireAdmin(cache, targetId);
    if (target.localOnly) throw new Error('Choose an online group.');
    const source = cache.groups.find(group => group.id === DEVELOPMENT_GROUP_ID);
    if (!source) throw new Error('Development group not found.');
    if (source.linkedTo && source.linkedTo !== targetId) throw new Error('Development data is already linked to another group.');
    source.linkedTo = targetId;
    cache.players = cache.players.map(player => player.groupId === DEVELOPMENT_GROUP_ID ? { ...player, groupId: targetId, syncStatus: 'pending' } : player);
    return targetId;
  });
}

export async function resolvePlayerIdentity(database, playerId, expectedRemoteId) {
  return changeIdentities(database, cache => {
    const player = cache.players.find(item => item.id === playerId);
    if (!player || player.syncStatus !== 'conflict' || !player.remotePlayer) throw new Error('Refresh this conflict before resolving it.');
    if (expectedRemoteId && player.remotePlayer.id !== expectedRemoteId) throw new Error('This conflict changed. Refresh and review the existing registration before confirming.');
    requireAdmin(cache, player.groupId);
    const remote = player.remotePlayer;
    if (remote.groupId !== player.groupId) throw new Error('Cannot link identities across groups.');
    if (remote.id !== player.id) {
      delete player.remotePlayer;
      delete player.conflictType;
      player.canonicalId = remote.id;
      player.syncStatus = 'synced';
      const index = cache.players.findIndex(item => item.id === remote.id);
      if (index >= 0) cache.players[index] = remote;
      else cache.players.push(remote);
    } else Object.assign(player, remote, { remotePlayer: undefined, conflictType: undefined });
  });
}

export async function renamePendingPlayer(database, playerId, rawName) {
  return changeIdentities(database, cache => {
    const player = cache.players.find(item => item.id === playerId);
    if (!player || player.syncStatus === 'synced' || player.canonicalId) throw new Error('Only pending players can be renamed here.');
    requireAdmin(cache, player.groupId);
    if (player.remotePlayer?.id === player.id) throw new Error('This identity already exists remotely. Use the server identity.');
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60) throw new Error('Enter a name with 1–60 characters.');
    const normalizedName = normalizeName(name);
    if (cache.players.some(item => item.id !== playerId && !item.canonicalId && item.groupId === player.groupId && item.normalizedName === normalizedName)) {
      throw new Error('This name is already registered. Use a different surname.');
    }
    Object.assign(player, { name, normalizedName, syncStatus: 'pending' });
    delete player.remotePlayer;
    delete player.conflictType;
  });
}

export async function recordPlayerSync(database, userId, localId, response) {
  const cache = await registryCache(database);
  const player = cache.players.find(item => item.id === localId);
  if (!player) throw new Error('Local player not found.');
  const remote = fromRemotePlayer(response.player);
  if (remote.groupId !== player.groupId || !['saved', 'name_conflict', 'identity_conflict'].includes(response.status) ||
      (response.status === 'saved' && remote.id !== localId)) throw new Error('Invalid player synchronization response.');
  const transaction = database.transaction([PLAYER_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(PLAYER_STORE);
  const current = store.get(localId);
  current.onsuccess = () => {
    if (!current.result || current.result.canonicalId) return;
    if (response.status === 'saved' && current.result.normalizedName === remote.normalizedName) store.put(remote);
    else store.put({ ...current.result, syncStatus: 'conflict', remotePlayer: remote,
      conflictType: response.status === 'name_conflict' ? 'name' : 'identity' });
    transaction.objectStore(SETTINGS_STORE).put(userId, 'identity');
  };
  await done;
}
