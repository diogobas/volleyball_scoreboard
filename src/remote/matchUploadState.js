import { CLOSED_STORE, SETTINGS_STORE, createLocalId, transactionDone } from '../game/storage.js';

const PREFIX = 'matchUpload:';
const LEASE_MS = 90_000;
export const uploadStateKey = (id) => `${PREFIX}${id}`;
export const uploadBusyError = () =>
  Object.assign(
    new Error('This match is already uploading. Wait for it to finish, then refresh.'),
    { code: 'MATCH_UPLOAD_BUSY' },
  );

export async function readMatchUploadStates(database) {
  const transaction = database.transaction(SETTINGS_STORE, 'readonly');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(SETTINGS_STORE);
  const keys = store.getAllKeys();
  const values = store.getAll();
  await done;
  return Object.fromEntries(
    keys.result.flatMap((key, index) => {
      if (typeof key !== 'string' || !key.startsWith(PREFIX)) return [];
      const value = values.result[index];
      if (!value || !['sending', 'failed'].includes(value.state))
        return [
          [
            key.slice(PREFIX.length),
            {
              state: 'interrupted',
              error: 'The previous upload status could not be read. Retry to confirm the match.',
            },
          ],
        ];
      return [
        [
          key.slice(PREFIX.length),
          value.state === 'sending' &&
          (!value.owner || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now())
            ? {
                ...value,
                state: 'interrupted',
                error:
                  'The previous upload was interrupted. Retry to confirm whether it reached the server.',
              }
            : value,
        ],
      ];
    }),
  );
}

async function claim(database, id) {
  const transaction = database.transaction([CLOSED_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const archive = transaction.objectStore(CLOSED_STORE).get(id);
  const store = transaction.objectStore(SETTINGS_STORE);
  const request = store.get(uploadStateKey(id));
  let owner = null;
  let failure;
  request.onsuccess = () => {
    if (!archive.result) return;
    if (
      request.result?.state === 'sending' &&
      request.result.owner &&
      request.result.expiresAt > Date.now()
    ) {
      failure = uploadBusyError();
      return;
    }
    owner = createLocalId();
    store.put(
      {
        state: 'sending',
        owner,
        expiresAt: Date.now() + LEASE_MS,
        attemptedAt: new Date().toISOString(),
        error: '',
      },
      uploadStateKey(id),
    );
  };
  await done;
  if (failure) throw failure;
  return owner;
}

async function updateOwned(database, id, owner, update) {
  const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(SETTINGS_STORE);
  const request = store.get(uploadStateKey(id));
  let owned = false;
  request.onsuccess = () => {
    if (request.result?.state !== 'sending' || request.result.owner !== owner) return;
    owned = true;
    if (update) store.put(update(request.result), uploadStateKey(id));
  };
  await done;
  return owned;
}

async function attempt(database, id, action) {
  const owner = await claim(database, id);
  if (!owner) return { status: 'not_local' };
  const controller = new AbortController();
  const interrupted = new Error(
    'Upload interrupted or timed out. The local match is kept; retry to confirm it.',
  );
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(controller.signal.reason ?? interrupted);
    controller.signal.addEventListener('abort', abortListener, { once: true });
  });
  const timeout = setTimeout(() => controller.abort(interrupted), 60_000);
  const heartbeat = setInterval(() => {
    updateOwned(database, id, owner, (state) => ({ ...state, expiresAt: Date.now() + LEASE_MS }))
      .then((owned) => {
        if (!owned) controller.abort(interrupted);
      })
      .catch(() => controller.abort(interrupted));
  }, 10_000);
  const guard = {
    owner,
    signal: controller.signal,
    check: async () => {
      controller.signal.throwIfAborted();
      if (!(await updateOwned(database, id, owner))) throw interrupted;
      controller.signal.throwIfAborted();
    },
  };
  try {
    return await Promise.race([action(guard), aborted]);
  } catch (error) {
    // Status is separate from game content; failed attempts never rewrite the archive.
    try {
      await updateOwned(database, id, owner, (state) => ({
        ...state,
        state: 'failed',
        owner: null,
        expiresAt: null,
        error: String(
          error.message || 'Upload failed. Check your connection and sign in, then retry.',
        ).slice(0, 600),
        finishedAt: new Date().toISOString(),
      }));
    } catch {
      /* Even status-write failures must keep the original match and report the upload error. */
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    controller.signal.removeEventListener('abort', abortListener);
  }
}

function withMatchUploadLock(database, id, action) {
  // Share the upload lock so another tab cannot send a match while it is deleted.
  const locks = globalThis.navigator?.locks;
  if (locks?.request)
    return locks.request(
      `${database.name}:${uploadStateKey(id)}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw uploadBusyError();
        return action();
      },
    );
  return action();
}

export function withMatchUploadAttempt(database, id, action) {
  // Web Locks survive background timer throttling; IndexedDB leases also protect
  // independent connections on platforms without Web Locks.
  return withMatchUploadLock(database, id, () => attempt(database, id, action));
}

export function deleteSavedMatch(database, id) {
  return withMatchUploadLock(database, id, async () => {
    const transaction = database.transaction([CLOSED_STORE, SETTINGS_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const settings = transaction.objectStore(SETTINGS_STORE);
    const lease = settings.get(uploadStateKey(id));
    let failure;
    lease.onsuccess = () => {
      const state = lease.result;
      if (state?.state === 'sending' && state.owner && state.expiresAt > Date.now()) {
        failure = uploadBusyError();
        return;
      }
      transaction.objectStore(CLOSED_STORE).delete(id);
      settings.delete(uploadStateKey(id));
    };
    await done;
    if (failure) throw failure;
  });
}
