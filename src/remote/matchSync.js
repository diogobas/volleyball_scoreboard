import { CLOSED_STORE, transactionDone } from '../game/storage.js';
import { cachedAdmin, registryCache } from '../game/registryCache.js';
import { registrySession, synchronizePlayers } from './playerRegistry.js';
import { matchPayload, samePayload } from './matchPayload.js';

const running = new WeakMap();

export async function readClosedMatch(database, id) {
  const transaction = database.transaction(CLOSED_STORE, 'readonly');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(CLOSED_STORE).get(id);
  await done;
  return request.result;
}

// The acknowledgement covers the original submission, even after an admin revision.
export async function removeConfirmedMatch(database, archive, submission, confirmation) {
  if (!['saved', 'already_saved'].includes(confirmation?.status) || confirmation.match_id !== archive.id ||
      confirmation.group_id !== submission.group_id || !Number.isInteger(confirmation.version) || confirmation.version < 1 ||
      !samePayload(confirmation.submission, submission)) throw new Error('Remote confirmation did not match this submission. Local match kept.');
  const transaction = database.transaction(CLOSED_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(CLOSED_STORE);
  const request = store.get(archive.id);
  let changed = false;
  request.onsuccess = () => {
    if (!request.result) return; // Another confirmed attempt already removed it.
    if (!samePayload(request.result, archive)) { changed = true; return; }
    store.delete(archive.id);
  };
  await done;
  if (changed) throw new Error('Local match changed during upload. Its data has been kept for review.');
}

export async function uploadStoredMatch(database, id, suppliedClient) {
  let matches = running.get(database);
  if (!matches) { matches = new Map(); running.set(database, matches); }
  if (matches.has(id)) return matches.get(id);
  const operation = upload(database, id, suppliedClient).finally(() => matches.delete(id));
  matches.set(id, operation);
  return operation;
}

async function upload(database, id, suppliedClient) {
  const initial = await readClosedMatch(database, id);
  if (!initial) return { status: 'not_local' };
  const groupId = initial.state?.groupId;
  const before = await registryCache(database);
  const group = before.groups.find(item => item.id === groupId);
  if (!groupId || !group || group.localOnly) throw new Error('Link this match to an online group before uploading.');
  // This only synchronizes the registry. Other pending matches are never uploaded here.
  const playersResult = await synchronizePlayers(database, groupId, suppliedClient);
  if (playersResult.error) throw new Error(playersResult.error);
  const archive = await readClosedMatch(database, id);
  if (!archive) return { status: 'not_local' };
  const submission = matchPayload(archive);
  if (submission.group_id !== groupId) throw new Error('Match group changed during preparation. Local match kept.');
  const cache = await registryCache(database);
  const connection = await registrySession(database, suppliedClient);
  if (!connection.session || !cachedAdmin({ ...cache, userId: connection.userId }, group)) throw new Error('Sign in as a group administrator to upload. Local match kept.');
  const people = submission.sets.flatMap(set => Object.values(set.rosters).flat());
  if (people.some(person => !cache.players.some(player => player.id === person.id && player.groupId === groupId && player.syncStatus === 'synced' && !player.canonicalId))) {
    throw new Error('Resolve the participants in Players & sync before uploading. Local match kept.');
  }
  const { data, error } = await connection.client.rpc('submit_match', { p_match: submission });
  if (error) throw error;
  const current = await connection.client.auth.getSession();
  if (current.error || current.data.session?.user.id !== connection.userId) throw new Error('The signed-in account changed. Local match kept.');
  await removeConfirmedMatch(database, archive, submission, data);
  return { status: 'confirmed', id, version: data.version };
}
