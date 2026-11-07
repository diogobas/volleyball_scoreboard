import { canCloseMatch, restoreMatch, TEAM_IDS } from './match.js';
import { matchPayload } from '../remote/matchPayload.js';
import { CLOSED_STORE, SETTINGS_STORE, transactionDone } from './storage.js';

export function applyDayLineup(state, context) {
  if (state.log.some(entry => entry.type === 'point')) throw new Error('Save or reset the current match before loading a lineup.');
  const next = structuredClone(state);
  // Day identity is separate from the former mandatory player registry.
  delete next.groupId; delete next.initialRoster;
  for (const team of TEAM_IDS) {
    next.teams[team].name = context.lineup[team].name;
    next.teams[team].players.forEach((player, i) => {
      delete player.personId;
      if (!player.isError) player.name = context.lineup[team].players[i].name;
    });
  }
  next.dayContext = context;
  next.court = { initial: structuredClone(next.teams), changes: [] };
  return restoreMatch(JSON.stringify(next));
}

const names = teams => Object.fromEntries(TEAM_IDS.map(team => [team, teams[team].players.filter(p => !p.isError).map(p => ({ name: p.name, hint_id: p.personId ?? null, slot: p.id }))]));

// Every active segment keeps all twelve participants, including people with no points.
export function receivedMatchPayload(archive) {
  const state = restoreMatch(JSON.stringify(archive.state));
  if (archive.formatVersion !== 1 || !canCloseMatch(state)) throw new Error('This archive has an unfinished set. Its data has been kept.');
  const context = archive.dayContext ?? state.dayContext;
  if (!context) throw new Error('Enter the game-day code before syncing.');
  // Preserve the original upload bytes for archives created before this release.
  // A prior upload may already be durable even if its acknowledgement was lost.
  if (!state.court && state.groupId === context.group_id) return matchPayload(archive);
  let roster = names(state.court?.initial ?? state.teams);
  if (state.initialRoster) roster = Object.fromEntries(TEAM_IDS.map(team => [team, state.initialRoster[team].map(p => ({ name: p.name, hint_id: p.personId, slot: p.id }))]));
  const sets = []; let points = []; let segments = [];
  const known = state.dayContext?.day_id === context.day_id ? state.dayContext.lineup : null;
  const snapshot = () => Object.fromEntries(TEAM_IDS.map(team => [team, roster[team].map(p => {
    // Matching a name alone never establishes an identity. Downloaded untouched positions do.
    const original = state.dayContext?.day_id === context.day_id ? known?.[team]?.players[Number(p.slot.slice(1))-1] : null;
    const hintId = state.groupId === context.group_id && p.hint_id ? p.hint_id : (original?.name === p.name ? original.id : null);
    return { key: JSON.stringify([team, p.slot, p.name, hintId]), name: p.name, hint_id: hintId, slot: p.slot };
  })]));
  state.log.forEach((entry, index) => {
    for (const change of state.court?.changes ?? []) if (Math.min(change.at, state.log.length) === index) roster = names(change.teams);
    if (entry.type === 'roster') roster = Object.fromEntries(TEAM_IDS.map(team => [team, entry.rosters[team].map(p => ({ name: p.name, hint_id: p.personId, slot: p.id }))]));
    if (entry.type === 'point') {
      // Legacy points carry the historical display name even without an edit event.
      if (entry.playerId !== 'err') roster[entry.team] = roster[entry.team].map(p => p.slot === entry.playerId ? { ...p, name: entry.playerName } : p);
      const active = snapshot();
      if (!segments.length || JSON.stringify(segments.at(-1).rosters) !== JSON.stringify(active)) segments.push({ from_point: points.length, rosters: active });
      const person = active[entry.team].find(p => p.slot === entry.playerId);
      points.push({ team: entry.team, participant_key: person?.key ?? null, player_name: person?.name ?? null, is_opponent_error: entry.playerId === 'err' });
    }
    if (entry.type === 'set') {
      sets.push({ team_a_name: entry.teamAName, team_b_name: entry.teamBName, score_a: entry.scoreA, score_b: entry.scoreB, segments, points });
      points = []; segments = [];
    }
  });
  return { format_version: 2, id: archive.id, day_id: context.day_id, group_id: context.group_id,
    lineup_version: state.dayContext?.day_id === context.day_id ? state.dayContext.lineup_version : null,
    started_at: state.startedAt ?? null, closed_at: archive.closedAt,
    team_a_name: state.teams.A.name, team_b_name: state.teams.B.name, sets };
}

export async function bindSavedMatch(database, id, context) {
  const tx = database.transaction([CLOSED_STORE, SETTINGS_STORE], 'readwrite'); const done = transactionDone(tx);
  const store = tx.objectStore(CLOSED_STORE); const request = store.get(id); let failure;
  const lease = tx.objectStore(SETTINGS_STORE).get(`matchUpload:${id}`);
  lease.onsuccess = () => {
    if (!request.result) { failure = new Error('Saved match no longer exists.'); tx.abort(); return; }
    if (lease.result?.state === 'sending' && lease.result.expiresAt > Date.now()) { failure = new Error('Wait for the upload to finish before changing its code.'); tx.abort(); return; }
    const existing = request.result.dayContext ?? request.result.state.dayContext;
    if (existing && existing.day_id !== context.day_id) { failure = new Error('This match is already linked to another day. Its original link was kept.'); tx.abort(); return; }
    store.put({ ...request.result, dayContext: context });
  };
  try { await done; } catch (error) { throw failure ?? error; }
}
