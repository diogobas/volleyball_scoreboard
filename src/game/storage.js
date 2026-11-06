import { canCloseMatch, createMatch, matchReducer, restoreMatch, STORAGE_KEY } from './match.js';

export const DATABASE_NAME = 'volleyball-scoreboard';
export const DATABASE_VERSION = 2;
export const ACTIVE_STORE = 'activeMatches';
export const CLOSED_STORE = 'closedMatches';
export const GROUP_STORE = 'groups';
export const PLAYER_STORE = 'players';
const ACTIVE_KEY = 'current';

export function transactionDone(transaction) {
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
      if (!database.objectStoreNames.contains(GROUP_STORE)) database.createObjectStore(GROUP_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(PLAYER_STORE)) {
        const players = database.createObjectStore(PLAYER_STORE, { keyPath: 'id' });
        players.createIndex('groupId', 'groupId');
        players.createIndex('groupName', ['groupId', 'normalizedName'], { unique: true });
      }
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

export async function listStoredMatches(database) {
  const transaction = database.transaction(CLOSED_STORE, 'readonly');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(CLOSED_STORE).getAll();
  await done;
  return request.result.map(archive => {
    try {
      if (archive.formatVersion !== 1 || !Number.isFinite(Date.parse(archive.closedAt))) {
        throw new Error('Unsupported archive');
      }
      const state = restoreMatch(JSON.stringify(archive.state));
      if (!canCloseMatch(state)) throw new Error('Incomplete archive');
      return { ...archive, state };
    } catch {
      // Keep unreadable entries visible without modifying or dropping their stored data.
      return { id: archive.id, syncStatus: archive.syncStatus, unavailable: true };
    }
  }).sort((a, b) => (Date.parse(b.closedAt) || 0) - (Date.parse(a.closedAt) || 0) ||
    String(a.id).localeCompare(String(b.id)));
}

export function createLocalId() {
  // getRandomValues also works when testing the web app over a local HTTP network.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function closeStoredMatch(database, state, {
  id = createLocalId(), closedAt = new Date().toISOString(),
} = {}) {
  const snapshot = restoreMatch(JSON.stringify(state));
  if (!canCloseMatch(snapshot)) throw new Error('Close the current set before closing the match.');
  const nextState = matchReducer(snapshot, { type: 'reset' });
  const archive = { id, formatVersion: 1, closedAt, syncStatus: 'pending', state: snapshot };
  const transaction = database.transaction([ACTIVE_STORE, CLOSED_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const active = transaction.objectStore(ACTIVE_STORE);
  let failure;
  const request = active.get(ACTIVE_KEY);
  request.onsuccess = () => {
    try {
      if (request.result?.formatVersion !== 1 ||
          JSON.stringify(request.result.state) !== JSON.stringify(state)) {
        throw new Error('The saved match changed. Reload the app and review it before closing.');
      }
      // Both writes commit together. add() also prevents replacing an existing archive.
      transaction.objectStore(CLOSED_STORE).add(archive);
      active.put({ formatVersion: 1, state: nextState }, ACTIVE_KEY);
    } catch (error) {
      failure = error;
      transaction.abort();
    }
  };
  try { await done; }
  catch (error) { throw failure ?? error; }
  return nextState;
}
