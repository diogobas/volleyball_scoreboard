import { errorCode, errorMessage } from '../game/errors';
import { cachedAdmin, registryCache } from '../game/registryCache';
import { CLOSED_STORE, SETTINGS_STORE, listStoredMatches, transactionDone } from '../game/storage';
import type { MatchArchive } from '../game/types';
import { matchPayload, samePayload } from './matchPayload';
import type { UploadGuard } from './matchUploadState';
import { uploadStateKey, withMatchUploadAttempt } from './matchUploadState';
import type { MatchSubmission, SubmitMatchReceipt } from './models';
import { registrySession, synchronizePlayers } from './playerRegistry';
import type { RegistryClient } from './transport';
import { requestRpc } from './transport';
type UploadResult = { status: 'not_local' } | { status: 'confirmed'; id: string; version: number };
export interface SyncSummary {
  total: number;
  confirmed: number;
  failed: number;
  busy: number;
  skipped: number;
}
export interface SyncProgress {
  id: string;
  index: number;
  total: number;
  phase: 'sending' | 'confirmed' | 'failed' | 'busy' | 'skipped';
  error?: string;
}

const running = new WeakMap<IDBDatabase, Map<string, Promise<UploadResult>>>();

export const readClosedMatch = async (
  database: IDBDatabase,
  id: string,
): Promise<MatchArchive | undefined> => {
  const transaction = database.transaction(CLOSED_STORE, 'readonly');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(CLOSED_STORE).get(id);
  await done;
  return request.result;
};

// The acknowledgement covers the original submission, even after an admin revision.
export const removeConfirmedMatch = async (
  database: IDBDatabase,
  archive: MatchArchive,
  submission: MatchSubmission,
  confirmation: Omit<Partial<SubmitMatchReceipt>, 'submission'> & {
    submission?: MatchSubmission | null;
  },
  guard?: UploadGuard,
) => {
  if (
    !['saved', 'already_saved'].includes(confirmation?.status ?? '') ||
    confirmation.match_id !== archive.id ||
    confirmation.group_id !== submission.group_id ||
    !Number.isInteger(confirmation.version) ||
    confirmation.version! < 1 ||
    !samePayload(confirmation.submission, submission)
  )
    throw new Error('Remote confirmation did not match this submission. Local match kept.');
  const transaction = database.transaction([CLOSED_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(CLOSED_STORE);
  const settings = transaction.objectStore(SETTINGS_STORE);
  const lease = settings.get(uploadStateKey(archive.id));
  const request = store.get(archive.id);
  let changed = false;
  request.onsuccess = () => {
    if (!request.result) return; // Another confirmed attempt already removed it.
    if (
      guard &&
      (guard.signal.aborted ||
        lease.result?.owner !== guard.owner ||
        lease.result?.state !== 'sending')
    ) {
      changed = true;
      return;
    }
    if (!samePayload(request.result, archive)) {
      changed = true;
      return;
    }
    store.delete(archive.id);
    settings.delete(uploadStateKey(archive.id));
  };
  await done;
  if (changed)
    throw new Error('Local match changed during upload. Its data has been kept for review.');
};

export const uploadStoredMatch = async (
  database: IDBDatabase,
  id: string,
  suppliedClient?: RegistryClient | null,
): Promise<UploadResult> => {
  let matches = running.get(database);
  if (!matches) {
    matches = new Map();
    running.set(database, matches);
  }
  if (matches.has(id)) return matches.get(id)!;
  const operation = withMatchUploadAttempt(database, id, (guard) =>
    upload(database, id, suppliedClient, guard),
  ).finally(() => matches!.delete(id));
  matches.set(id, operation);
  return operation;
};

const upload = async (
  database: IDBDatabase,
  id: string,
  suppliedClient: RegistryClient | null | undefined,
  guard: UploadGuard,
): Promise<UploadResult> => {
  if (globalThis.navigator?.onLine === false)
    throw new Error('You are offline. Reconnect and press Sync pending matches.');
  const initial = await readClosedMatch(database, id);
  if (!initial) return { status: 'not_local' as const };
  const groupId = initial.state?.groupId;
  const before = await registryCache(database);
  const group = before.groups.find((item) => item.id === groupId);
  if (!groupId || !group || group.localOnly)
    throw new Error('Link this match to an online group before uploading.');
  // This only synchronizes the registry. Other pending matches are never uploaded here.
  const playersResult = await synchronizePlayers(database, groupId, suppliedClient);
  await guard.check();
  if (playersResult.error) throw new Error(playersResult.error);
  const archive = await readClosedMatch(database, id);
  if (!archive) return { status: 'not_local' as const };
  const submission = matchPayload(archive);
  if (submission.group_id !== groupId)
    throw new Error('Match group changed during preparation. Local match kept.');
  const cache = await registryCache(database);
  const connection = await registrySession(database, suppliedClient);
  await guard.check();
  if (
    !connection.session ||
    !connection.client ||
    !cachedAdmin({ ...cache, userId: connection.userId }, group)
  )
    throw new Error('Sign in as a group administrator to upload. Local match kept.');
  const people = submission.sets.flatMap((set) => Object.values(set.rosters).flat());
  if (
    people.some(
      (person) =>
        !cache.players.some(
          (player) =>
            player.id === person.id &&
            player.groupId === groupId &&
            player.syncStatus === 'synced' &&
            !player.canonicalId,
        ),
    )
  ) {
    throw new Error(
      'Resolve the participants in Players & sync before uploading. Local match kept.',
    );
  }
  let request = requestRpc(connection.client, 'submit_match', { p_match: submission });
  if (request.abortSignal) request = request.abortSignal(guard.signal);
  const { data, error } = await request;
  if (error) throw error;
  await guard.check();
  const current = await connection.client.auth.getSession();
  if (current.error || current.data.session?.user.id !== connection.userId)
    throw new Error('The signed-in account changed. Local match kept.');
  await guard.check();
  await removeConfirmedMatch(database, archive, submission, data, guard);
  return { status: 'confirmed', id, version: data.version };
};

const queues = new WeakMap<IDBDatabase, Promise<SyncSummary>>();
export const isPendingSyncRunning = (database: IDBDatabase) => queues.has(database);

export const closeDatabaseWhenUploadsFinish = async (database: IDBDatabase) => {
  const jobs = [...(running.get(database)?.values() ?? []), queues.get(database)].filter(Boolean);
  if (jobs.length) await Promise.allSettled(jobs);
  database.close();
};

// Explicit invocation only. Snapshot IDs so games closed during this run wait for
// their own automatic attempt or the next user request. Failures never stop others.
export const syncPendingMatches = async (
  database: IDBDatabase,
  onProgress: (progress: SyncProgress) => void = () => {},
  suppliedClient?: RegistryClient | null,
): Promise<SyncSummary> => {
  if (queues.has(database)) return queues.get(database)!;
  const emit = (progress: SyncProgress) => {
    try {
      onProgress(progress);
    } catch {
      /* UI observers cannot interrupt persistence. */
    }
  };
  const operation = (async () => {
    const pending = (await listStoredMatches(database))
      .filter((match) => match.syncStatus === 'pending')
      .reverse();
    const summary = { total: pending.length, confirmed: 0, failed: 0, busy: 0, skipped: 0 };
    for (const [index, match] of pending.entries()) {
      emit({ id: match.id, index: index + 1, total: pending.length, phase: 'sending' });
      try {
        const result = await uploadStoredMatch(database, match.id, suppliedClient);
        const phase = result.status === 'confirmed' ? 'confirmed' : 'skipped';
        summary[phase]++;
        emit({ id: match.id, index: index + 1, total: pending.length, phase });
      } catch (error) {
        const phase = errorCode(error) === 'MATCH_UPLOAD_BUSY' ? 'busy' : 'failed';
        summary[phase]++;
        emit({
          id: match.id,
          index: index + 1,
          total: pending.length,
          phase,
          error: errorMessage(error) || 'Upload failed. Local data kept.',
        });
      }
    }
    return summary;
  })().finally(() => queues.delete(database));
  queues.set(database, operation);
  return operation;
};
