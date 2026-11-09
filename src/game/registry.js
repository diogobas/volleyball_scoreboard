import { normalizeName } from './playerNames.js';
import { canChangeRoster, matchReducer, matchRoster, restoreMatch, TEAM_IDS } from './match.js';
import { ACTIVE_STORE, CLOSED_STORE, GROUP_STORE, PLAYER_STORE, SETTINGS_STORE, createLocalId, transactionDone } from './storage.js';

export const DEVELOPMENT_GROUP_ID = '00000000-0000-4000-8000-000000000001';
export { normalizeName } from './playerNames.js';

export async function loadDevelopmentGroup(database) {
  const transaction = database.transaction(GROUP_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(GROUP_STORE);
  const request = store.get(DEVELOPMENT_GROUP_ID);
  let group;
  request.onsuccess = () => {
    group = request.result ?? { id: DEVELOPMENT_GROUP_ID, name: 'Development group', localOnly: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (!request.result) store.add(group);
  };
  await done;
  return group;
}

export async function listPlayers(database, groupId) {
  const transaction = database.transaction(PLAYER_STORE, 'readonly');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(PLAYER_STORE).index('groupId').getAll(groupId);
  await done;
  return request.result.filter(player => !player.canonicalId).sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
}

export async function loadSelectedGroup(database, requestedId) {
  const development = await loadDevelopmentGroup(database);
  const transaction = database.transaction([GROUP_STORE, SETTINGS_STORE], 'readonly');
  const done = transactionDone(transaction);
  const groups = transaction.objectStore(GROUP_STORE).getAll();
  const selected = transaction.objectStore(SETTINGS_STORE).get('selectedGroup');
  await done;
  let group = groups.result.find(item => item.id === (requestedId ?? selected.result)) ?? development;
  const seen = new Set();
  while (group.linkedTo) {
    if (seen.has(group.id)) throw new Error('Invalid group link');
    seen.add(group.id);
    group = groups.result.find(item => item.id === group.linkedTo);
    if (!group) throw new Error('Linked group is unavailable');
  }
  return group;
}

export async function registerPlayer(database, groupId, rawName) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 60) throw new Error('Enter a name with 1–60 characters.');
  const normalizedName = normalizeName(name);
  const player = { id: createLocalId(), groupId, name, normalizedName, syncStatus: 'pending' };
  const transaction = database.transaction([GROUP_STORE, PLAYER_STORE], 'readwrite');
  const done = transactionDone(transaction);
  let failure;
  const group = transaction.objectStore(GROUP_STORE).get(groupId);
  group.onsuccess = () => {
    if (!group.result) { failure = new Error('Group not found.'); transaction.abort(); return; }
    const store = transaction.objectStore(PLAYER_STORE);
    const request = store.index('groupId').getAll(groupId);
    request.onsuccess = () => {
      const existing = request.result.find(p => !p.canonicalId && (p.normalizedName === normalizedName ||
        (!normalizedName.includes(' ') && p.normalizedName.split(' ')[0] === normalizedName)));
      if (existing) {
        failure = new Error('A player with this name already exists. Select the existing player, or enter a surname for a different person.');
        failure.existingPlayer = existing;
        transaction.abort();
      } else store.add(player);
    };
  };
  try { await done; } catch (error) { throw failure ?? error; }
  return player;
}

// Slot IDs remain compatible with old scoring/Undo. personId is the permanent identity.
export function assignMatchPlayers(state, groupId, teams, players, { preserveNames = false } = {}) {
  if (state.groupId && state.groupId !== groupId && state.log.length) throw new Error('This match belongs to a different group.');
  let result = structuredClone(state);
  result.groupId = groupId;
  const used = new Set();
  for (const teamId of TEAM_IDS) {
    result.teams[teamId].name = preserveNames ? state.teams[teamId].name : teams[teamId].name.trim().slice(0, 16) || state.teams[teamId].name;
    for (let i = 0; i < 6; i++) {
      const selected = players.find(player => player.id === teams[teamId].players[i].personId && player.groupId === groupId);
      if (!selected) throw new Error('Select a registered player for all 12 positions.');
      if (used.has(selected.id)) throw new Error('A player cannot occupy more than one position.');
      used.add(selected.id);
      const previous = state.teams[teamId].players[i];
      if (state.groupId && !canChangeRoster(state) && previous.personId !== selected.id) {
        throw new Error('Players can only change between sets, before the next point.');
      }
      result.teams[teamId].players[i] = { ...previous, personId: selected.id, name: preserveNames ? previous.name : selected.name };
    }
  }
  if (!state.groupId) {
    result.log = result.log.map(entry => entry.type !== 'point' || entry.playerId === 'err' ? entry : {
      ...entry, personId: result.teams[entry.team].players.find(player => player.id === entry.playerId).personId,
    });
  } else if (state.log.length && JSON.stringify(matchRoster(state)) !== JSON.stringify(matchRoster(result))) {
    const renamed = result.teams;
    result = matchReducer(state, { type: 'roster', rosters: matchRoster(result) });
    for (const id of TEAM_IDS) result.teams[id].name = renamed[id].name;
  }
  return restoreMatch(JSON.stringify(result));
}

export async function saveMatchPlayers(database, state, groupId, teams, archiveId = null) {
  const targetStore = archiveId === null ? ACTIVE_STORE : CLOSED_STORE;
  const transaction = database.transaction([targetStore, GROUP_STORE, PLAYER_STORE], 'readwrite');
  const done = transactionDone(transaction);
  let result;
  let failure;
  const fail = error => { failure = error; transaction.abort(); };
  const groupRequest = transaction.objectStore(GROUP_STORE).get(groupId);
  groupRequest.onsuccess = () => {
    if (!groupRequest.result) { fail(new Error('Group not found.')); return; }
    const playerRequest = transaction.objectStore(PLAYER_STORE).index('groupId').getAll(groupId);
    playerRequest.onsuccess = () => {
      const store = transaction.objectStore(targetStore);
      const request = store.get(archiveId ?? 'current');
      request.onsuccess = () => {
        try {
          const record = request.result;
          if (!record || record.formatVersion !== 1 || JSON.stringify(record.state) !== JSON.stringify(state)) {
            throw new Error('The saved match changed. Reopen it and try again.');
          }
          if (archiveId !== null && state.groupId) throw new Error('This saved match is already associated.');
          result = assignMatchPlayers(state, groupId, teams, playerRequest.result, { preserveNames: archiveId !== null });
          store.put({ ...record, state: result }, archiveId === null ? 'current' : undefined);
        } catch (error) { fail(error); }
      };
    };
  };
  try { await done; } catch (error) { throw failure ?? error; }
  return result;
}
