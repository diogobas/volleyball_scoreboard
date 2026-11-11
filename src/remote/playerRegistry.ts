import { errorCode, errorMessage, errorStatus } from '../game/errors';
import { loadDevelopmentGroup } from '../game/registry';
import {
  cacheAuthorizedGroups,
  cachedAdmin,
  cacheRemoteRegistry,
  forgetRegistryAccess,
  recordPlayerSync,
  registryCache,
  setRegistryIdentity,
} from '../game/registryCache';
import type { RegistryClient, RegistryConnection, RpcResults } from './transport';
import { requestRpc } from './transport';
interface PlayerSyncSummary {
  saved: number;
  pending: number;
  conflicts: number;
  error: string;
}

const running = new WeakMap<IDBDatabase, Map<string, Promise<PlayerSyncSummary>>>();

export const registrySession = async (
  database: IDBDatabase,
  suppliedClient?: RegistryClient | null,
): Promise<RegistryConnection> => {
  const cache = await registryCache(database);
  if (!suppliedClient && globalThis.navigator?.onLine === false)
    return { client: null, userId: cache.userId, session: null };
  let client = suppliedClient;
  if (!client) {
    try {
      client = (await import('./client')).getRemoteClient();
    } catch {
      /* offline module or missing config */
    }
  }
  if (!client) return { client: null, userId: cache.userId, session: null };
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id ?? null;
    if (cache.userId !== userId) await setRegistryIdentity(database, userId);
    return { client, userId, session: data.session };
  } catch (failure) {
    if (errorStatus(failure) >= 400 && errorStatus(failure) < 500 && errorStatus(failure) !== 429) {
      await setRegistryIdentity(database, null);
      return { client, userId: null, session: null };
    }
    // This is only an offline convenience. Server RPCs always recheck the JWT and membership.
    return { client, userId: cache.userId, session: null };
  }
};

const rpc = async <K extends keyof RpcResults & string>(
  connection: RegistryConnection,
  name: K,
  parameters?: Record<string, unknown>,
) => {
  if (!connection.client || !connection.session)
    throw new Error('Connect and sign in to synchronize players.');
  const { data, error } = await requestRpc(connection.client, name, parameters);
  if (error) throw error;
  const current = await connection.client.auth.getSession();
  if (current.error || current.data.session?.user.id !== connection.userId)
    throw new Error('The signed-in account changed. Refresh before continuing.');
  return data;
};

export const refreshRegistryGroups = async (
  database: IDBDatabase,
  connection: RegistryConnection,
) => {
  const rows = await rpc(connection, 'list_my_groups');
  if (!Array.isArray(rows))
    throw new Error('Groups could not be confirmed. Cached data has been kept.');
  await cacheAuthorizedGroups(database, connection.userId!, rows);
  return rows;
};

export const refreshRegistryGroup = async (
  database: IDBDatabase,
  groupId: string,
  connection: RegistryConnection,
) => {
  try {
    const response = await rpc(connection, 'get_group_registry', { p_group_id: groupId });
    if (response?.group?.id !== groupId)
      throw new Error('Wrong group in registry response. Cached data has been kept.');
    await cacheRemoteRegistry(database, connection.userId!, response);
  } catch (failure) {
    if (errorCode(failure) === '42501')
      await forgetRegistryAccess(database, connection.userId!, groupId);
    throw failure;
  }
};

export const prepareRegistry = async (
  database: IDBDatabase,
  requestedGroupId?: string,
  suppliedClient?: RegistryClient | null,
) => {
  await loadDevelopmentGroup(database);
  const connection = await registrySession(database, suppliedClient);
  let error = '';
  if (connection.session && globalThis.navigator?.onLine !== false) {
    try {
      await refreshRegistryGroups(database, connection);
      const cache = await registryCache(database);
      let group = cache.groups.find(
        (item) => item.id === (requestedGroupId ?? cache.selectedGroupId),
      );
      if (group?.linkedTo) group = cache.groups.find((item) => item.id === group!.linkedTo);
      if (group && !group.localOnly && cachedAdmin(cache, group))
        await refreshRegistryGroup(database, group.id, connection);
    } catch (failure) {
      error = errorMessage(failure) || 'Online refresh failed. Cached players are still available.';
    }
  }
  return { cache: await registryCache(database), connection, error };
};

export const synchronizePlayers = async (
  database: IDBDatabase,
  groupId: string,
  suppliedClient?: RegistryClient | null,
): Promise<PlayerSyncSummary> => {
  let groups = running.get(database);
  if (!groups) {
    groups = new Map();
    running.set(database, groups);
  }
  if (groups.has(groupId)) return groups.get(groupId)!;
  const operation = sync(database, groupId, suppliedClient).finally(() => groups!.delete(groupId));
  groups.set(groupId, operation);
  return operation;
};

const sync = async (
  database: IDBDatabase,
  groupId: string,
  suppliedClient?: RegistryClient | null,
): Promise<PlayerSyncSummary> => {
  const connection = await registrySession(database, suppliedClient);
  await refreshRegistryGroups(database, connection);
  const cache = await registryCache(database);
  const group = cache.groups.find((item) => item.id === groupId);
  if (!group || group.localOnly || !cachedAdmin(cache, group))
    throw new Error('You are not authorized to synchronize this group. Local data has been kept.');
  await refreshRegistryGroup(database, groupId, connection);
  const latest = await registryCache(database);
  let saved = 0;
  let error = '';
  for (const player of latest.players.filter(
    (item) => item.groupId === groupId && !item.canonicalId && item.syncStatus === 'pending',
  )) {
    try {
      const result = await rpc(connection, 'sync_group_player', {
        p_group_id: groupId,
        p_player_id: player.id,
        p_name: player.name,
      });
      await recordPlayerSync(database, connection.userId!, player.id, result);
      if (result.status === 'saved') saved++;
    } catch (failure) {
      error = errorMessage(failure) || 'Player upload failed. Try again later.';
      break;
    }
  }
  if (!error) await refreshRegistryGroup(database, groupId, connection);
  const final = await registryCache(database);
  const players = final.players.filter(
    (player) => player.groupId === groupId && !player.canonicalId,
  );
  return {
    saved,
    pending: players.filter((player) => player.syncStatus === 'pending').length,
    conflicts: players.filter((player) => player.syncStatus === 'conflict').length,
    error,
  };
};
