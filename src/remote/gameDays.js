import { CLOSED_STORE, SETTINGS_STORE, transactionDone } from '../game/storage.js';
import { receivedMatchPayload } from '../game/gameDay.js';
import { samePayload } from './matchPayload.js';
import { readClosedMatch } from './matchSync.js';
import { uploadStateKey, withMatchUploadAttempt } from './matchUploadState.js';

export async function dayRpc(name, args, supplied, signal) {
  const client = supplied ?? (await import('./client.js')).getPublicClient();
  if (!client) throw new Error('Online service is not configured for this build.');
  let request = client.rpc(name, args);
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
export async function redeemDayCode(code, client) {
  const trimmed = code.trim();
  const day = await dayRpc('redeem_day_code', { p_code: trimmed }, client);
  return { ...day, code: trimmed };
}
const uploads = new WeakMap();

export async function closeDayDatabaseWhenUploadsFinish(database) {
  const active = uploads.get(database);
  while (active?.size) await Promise.allSettled([...active]);
  database.close();
}

export function uploadReceivedMatch(database, id, supplied) {
  let active = uploads.get(database);
  if (!active) { active = new Set(); uploads.set(database, active); }
  const operation = withMatchUploadAttempt(database, id, async guard => {
    if (globalThis.navigator?.onLine === false) throw new Error('Offline. Reconnect and sync this saved match later.');
    const archive = await readClosedMatch(database, id);
    if (!archive) return { status: 'not_local' };
    const context = archive.dayContext ?? archive.state.dayContext;
    const payload = receivedMatchPayload(archive);
    const receipt = await dayRpc('receive_day_match', { p_code: context.code, p_match: payload }, supplied, guard.signal);
    await guard.check();
    if (!['received', 'already_received'].includes(receipt?.status) || receipt.match_id !== id || receipt.day_id !== context.day_id || !samePayload(receipt.submission, payload)) throw new Error('Receipt did not match this match. Local data kept.');
    const tx = database.transaction([CLOSED_STORE, SETTINGS_STORE], 'readwrite'); const done = transactionDone(tx);
    const store = tx.objectStore(CLOSED_STORE); const settings = tx.objectStore(SETTINGS_STORE);
    const stored = store.get(id); const lease = settings.get(uploadStateKey(id)); let changed = false;
    lease.onsuccess = () => {
      if (guard.signal.aborted || lease.result?.owner !== guard.owner || lease.result?.state !== 'sending' || !samePayload(stored.result, archive)) { changed = true; return; }
      store.delete(id); settings.delete(uploadStateKey(id));
    };
    await done;
    if (changed) throw new Error('Local match changed during upload. Its data was kept.');
    return receipt;
  }).finally(() => active.delete(operation));
  active.add(operation);
  return operation;
}
