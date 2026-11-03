import { createMatch, restoreMatch, STORAGE_KEY } from './match.js';

export const DATABASE_NAME = 'volleyball-scoreboard';
export const DATABASE_VERSION = 1;
export const ACTIVE_STORE = 'activeMatches';
export const CLOSED_STORE = 'closedMatches';
const ACTIVE_KEY = 'current';

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local transaction aborted'));
    transaction.onerror = () => { /* onabort reports the final transaction failure */ };
  });
}

export function openMatchDatabase(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) return reject(new Error('IndexedDB is unavailable'));
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACTIVE_STORE)) database.createObjectStore(ACTIVE_STORE);
      if (!database.objectStoreNames.contains(CLOSED_STORE)) database.createObjectStore(CLOSED_STORE, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other app tabs and retry the database upgrade'));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (blocked) database.close();
      else resolve(database);
    };
  });
}

// Read/create in one transaction so concurrent initializations cannot overwrite a match.
export async function loadStoredMatch(database, readLegacy = () => globalThis.localStorage.getItem(STORAGE_KEY)) {
  const transaction = database.transaction(ACTIVE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(ACTIVE_STORE);
  let state;
  let failure;
  const request = store.get(ACTIVE_KEY);
  request.onsuccess = () => {
    try {
      if (request.result !== undefined) {
        if (request.result.formatVersion !== 1) throw new Error('Unsupported saved match format');
        state = restoreMatch(JSON.stringify(request.result.state));
      } else {
        const legacy = readLegacy();
        state = legacy === null ? createMatch() : restoreMatch(legacy);
        store.put({ formatVersion: 1, state }, ACTIVE_KEY);
      }
    } catch (error) {
      failure = error;
      transaction.abort();
    }
  };
  try { await done; }
  catch (error) { throw failure ?? error; }
  // Keep the legacy snapshot as a recovery copy; it is never used over IndexedDB.
  return state;
}

export async function saveStoredMatch(database, state) {
  const transaction = database.transaction(ACTIVE_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(ACTIVE_STORE).put({ formatVersion: 1, state }, ACTIVE_KEY);
  await done;
}
