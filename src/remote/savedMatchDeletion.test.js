import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  ACTIVE_STORE,
  CLOSED_STORE,
  SETTINGS_STORE,
  openMatchDatabase,
  transactionDone,
} from '../game/storage.js';
import {
  deleteSavedMatch,
  readMatchUploadStates,
  uploadStateKey,
  withMatchUploadAttempt,
} from './matchUploadState.js';

async function fixture(t) {
  const factory = new IDBFactory();
  const db = await openMatchDatabase(factory);
  t.after(() => db.close());
  const tx = db.transaction([CLOSED_STORE, ACTIVE_STORE, SETTINGS_STORE], 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(CLOSED_STORE).put({ id: 'remove', state: { unreadable: true } });
  tx.objectStore(CLOSED_STORE).put({ id: 'keep', state: { other: true } });
  tx.objectStore(ACTIVE_STORE).put({ state: { current: true } }, 'current');
  tx.objectStore(SETTINGS_STORE).put('unchanged', 'identity');
  tx.objectStore(SETTINGS_STORE).put(
    { state: 'failed', error: 'Offline' },
    uploadStateKey('remove'),
  );
  await done;
  return { db, factory };
}
async function get(db, store, key) {
  const tx = db.transaction(store);
  const done = transactionDone(tx);
  const request = tx.objectStore(store).get(key);
  await done;
  return request.result;
}

test('local deletion removes only the selected archive and its sync state, even if unreadable', async (t) => {
  const { db } = await fixture(t);
  await deleteSavedMatch(db, 'remove');
  await deleteSavedMatch(db, 'remove');
  assert.equal(await get(db, CLOSED_STORE, 'remove'), undefined);
  assert.equal((await readMatchUploadStates(db)).remove, undefined);
  assert.deepEqual(await get(db, CLOSED_STORE, 'keep'), { id: 'keep', state: { other: true } });
  assert.deepEqual(await get(db, ACTIVE_STORE, 'current'), { state: { current: true } });
  assert.equal(await get(db, SETTINGS_STORE, 'identity'), 'unchanged');
  let uploaded = false;
  assert.deepEqual(
    await withMatchUploadAttempt(db, 'remove', async () => {
      uploaded = true;
    }),
    { status: 'not_local' },
  );
  assert.equal(uploaded, false);
});

test('an upload in another connection prevents deletion until it finishes', async (t) => {
  const { db, factory } = await fixture(t);
  const other = await openMatchDatabase(factory);
  t.after(() => other.close());
  let release;
  let reached;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  const uploading = withMatchUploadAttempt(db, 'remove', async () => {
    reached();
    await gate;
    throw new Error('Upload failed');
  });
  const failed = assert.rejects(uploading, /Upload failed/);
  try {
    await ready;
    await assert.rejects(
      deleteSavedMatch(other, 'remove'),
      (error) => error.code === 'MATCH_UPLOAD_BUSY',
    );
    assert.ok(await get(other, CLOSED_STORE, 'remove'));
    assert.equal((await readMatchUploadStates(other)).remove.state, 'sending');
  } finally {
    release();
    await failed;
  }
  await deleteSavedMatch(other, 'remove');
  assert.equal(await get(db, CLOSED_STORE, 'remove'), undefined);
});

test('expired upload status can be deleted and both archive/state deletions roll back on failure', async (t) => {
  const { db } = await fixture(t);
  let tx = db.transaction(SETTINGS_STORE, 'readwrite');
  let done = transactionDone(tx);
  tx.objectStore(SETTINGS_STORE).put(
    { state: 'sending', owner: 'old', expiresAt: Date.now() - 1 },
    uploadStateKey('remove'),
  );
  await done;
  const failing = {
    name: db.name,
    transaction: (...args) => {
      const transaction = db.transaction(...args);
      const original = transaction.objectStore.bind(transaction);
      transaction.objectStore = (name) => {
        const store = original(name);
        if (name === CLOSED_STORE) {
          const remove = store.delete.bind(store);
          store.delete = (key) => {
            const request = remove(key);
            request.onsuccess = () => transaction.abort();
            return request;
          };
        }
        return store;
      };
      return transaction;
    },
  };
  await assert.rejects(deleteSavedMatch(failing, 'remove'));
  assert.ok(await get(db, CLOSED_STORE, 'remove'));
  assert.ok(await get(db, SETTINGS_STORE, uploadStateKey('remove')));
  await deleteSavedMatch(db, 'remove');
  assert.equal(await get(db, CLOSED_STORE, 'remove'), undefined);
});
