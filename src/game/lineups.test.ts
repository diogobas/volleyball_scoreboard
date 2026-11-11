import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eventWithRosters, readableArchive, required, rosterEvent } from '../test/assertions';
import {
  canChangeRoster,
  createMatch,
  matchPlayerStats,
  matchReducer,
  matchRoster,
  restoreMatch,
  setRanking,
  teamMatchPlayers,
} from './match';
import {
  assignMatchPlayers,
  DEVELOPMENT_GROUP_ID,
  loadDevelopmentGroup,
  registerPlayer,
  saveMatchPlayers,
} from './registry';
import {
  closeStoredMatch,
  listStoredMatches,
  loadStoredMatch,
  openMatchDatabase,
  saveStoredMatch,
} from './storage';
import type { MatchState, TeamId } from './types';

const groupId = DEVELOPMENT_GROUP_ID;
const people = Array.from({ length: 13 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 2).padStart(12, '0')}`,
  groupId,
  name: `Person ${i + 1}`,
}));
const start = () => {
  const state = createMatch();
  const teams = structuredClone(state.teams);
  for (const [index, id] of (['A', 'B'] as const).entries())
    for (let i = 0; i < 6; i++) teams[id].players[i].personId = people[index * 6 + i].id;
  return assignMatchPlayers(state, groupId, teams, people);
};
const point = (state: MatchState, team: TeamId = 'A', playerId = 'p1') =>
  matchReducer(state, { type: 'point', team, playerId });
const close = (state: MatchState) => matchReducer(state, { type: 'closeSet' });
const undo = (state: MatchState) => matchReducer(state, { type: 'undo' });
const reload = (state: MatchState) => restoreMatch(JSON.stringify(state));
const swap = (state: MatchState) => {
  const teams = structuredClone(state.teams);
  [teams.A.players[0].personId, teams.B.players[0].personId] = [
    teams.B.players[0].personId,
    teams.A.players[0].personId,
  ];
  return assignMatchPlayers(state, groupId, teams, people);
};

test('swaps between sets preserve point authors, per-set rankings and totals across both teams after reload', () => {
  const first = close(point(point(point(start()), 'B')));
  const ranking = setRanking(first, 1);
  let state = swap(first);
  assert.equal(state.teams.A.players[0].personId, people[6].id);
  assert.equal(state.teams.A.players[0].matchPoints, 1);
  assert.equal(state.teams.B.players[0].matchPoints, 2);
  assert.deepEqual(
    state.log.filter((entry) => entry.type === 'point'),
    first.log.filter((entry) => entry.type === 'point'),
  );
  assert.deepEqual(setRanking(state, 1), ranking);
  assert.deepEqual(reload(state), state);
  state = close(point(point(point(point(state), 'B'))));
  assert.deepEqual(reload(state), state);
  const stats = matchPlayerStats(state);
  assert.equal(required(stats.find((player) => player.personId === people[0].id)).matchPoints, 3);
  assert.equal(required(stats.find((player) => player.personId === people[6].id)).matchPoints, 4);
  assert.equal(stats.length, 12);
  assert.deepEqual(required(stats.find((player) => player.personId === people[0].id)).teamPoints, {
    A: 2,
    B: 1,
  });
  assert.deepEqual(required(stats.find((player) => player.personId === people[6].id)).teamPoints, {
    B: 1,
    A: 3,
  });
  assert.equal(
    teamMatchPlayers(state, 'A').reduce((sum, p) => sum + p.matchPoints, 0),
    5,
  );
  assert.equal(
    teamMatchPlayers(state, 'B').reduce((sum, p) => sum + p.matchPoints, 0),
    2,
  );
  const sets = state.log.filter((entry) => entry.type === 'set');
  assert.equal(required(sets[0].rosters).A[0].personId, people[0].id);
  assert.equal(required(sets[1].rosters).A[0].personId, people[6].id);
});

test('outside substitutes do not inherit points; departed and zero-point participants remain in statistics', () => {
  const first = close(point(start()));
  const teams = structuredClone(first.teams);
  teams.A.players[0].personId = people[12].id;
  let state = assignMatchPlayers(first, groupId, teams, people);
  assert.equal(state.teams.A.players[0].matchPoints, 0);
  assert.equal(
    matchPlayerStats(state).some((p) => p.personId === people[12].id),
    false,
  );
  state = point(state);
  const stats = matchPlayerStats(reload(state));
  assert.equal(stats.length, 13);
  assert.equal(required(stats.find((p) => p.personId === people[0].id)).matchPoints, 1);
  assert.equal(required(stats.find((p) => p.personId === people[12].id)).matchPoints, 1);
  assert.equal(required(stats.find((p) => p.personId === people[1].id)).matchPoints, 0);
});

test('Undo traverses points, closures and multiple roster edits in reverse without changing sides unexpectedly', () => {
  const scored = point(point(start()), 'B');
  const first = close(scored);
  const swapped = swap(first);
  const swappedAgain = swap(swapped);
  assert.deepEqual(undo(reload(swappedAgain)), swapped);
  assert.deepEqual(undo(reload(swapped)), first);
  assert.deepEqual(undo(undo(reload(swapped))), scored);
  const nextPoint = point(swapped);
  assert.deepEqual(undo(reload(nextPoint)), swapped);
  const closed = close(nextPoint);
  assert.deepEqual(undo(reload(closed)), nextPoint);
  const sides = matchReducer(swapped, { type: 'switchSides' });
  assert.equal(sides.sidesSwapped, !swapped.sidesSwapped);
  assert.deepEqual(matchRoster(sides), matchRoster(swapped));
  assert.deepEqual(matchRoster(undo(sides)), matchRoster(first));
  assert.equal(undo(sides).sidesSwapped, sides.sidesSwapped);
});

test('automatic set closure records the lineup and permits the next change, even when the final point was an error', () => {
  let state = start();
  for (let i = 0; i < 24; i++) state = point(state);
  assert.equal(canChangeRoster(state), false);
  assert.throws(() => swap(state), /between sets/);
  state = point(state, 'A', 'err');
  assert.equal(canChangeRoster(state), true);
  assert.equal(eventWithRosters(required(state.log.at(-1))).rosters.A[0].personId, people[0].id);
  const swapped = swap(state);
  assert.deepEqual(reload(swapped), swapped);
  assert.equal(required(teamMatchPlayers(swapped, 'A').find((p) => p.isError)).matchPoints, 1);
  assert.equal(matchPlayerStats(swapped).length, 12);
});

test('malformed roster histories, duplicate players and mid-set edits cannot restore or alter a valid match', () => {
  const state = swap(close(point(start())));
  const malformed = structuredClone(state);
  rosterEvent(required(malformed.log.at(-1))).previousRosters.A[0].personId = people[12].id;
  assert.throws(() => reload(malformed), /roster history/);
  const duplicate = matchRoster(state);
  duplicate.B[0].personId = duplicate.A[0].personId;
  assert.throws(() => matchReducer(state, { type: 'roster', rosters: duplicate }), /roster player/);
  assert.throws(
    () => matchReducer(point(state), { type: 'roster', rosters: matchRoster(state) }),
    /between sets/,
  );
  const wrong = structuredClone(state);
  wrong.teams.A.players[0].personId = people[12].id;
  assert.throws(() => reload(wrong), /history/);
  assert.deepEqual(reload(state), state);
});

test('stored swaps survive reopen/archival; the next match retains the latest roster with zero totals', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const state = close(point(swap(close(point(start())))));
  await saveStoredMatch(database, state);
  assert.deepEqual(await loadStoredMatch(database), state);
  const next = await closeStoredMatch(database, state);
  const archive = (await listStoredMatches(database))[0];
  assert.deepEqual(readableArchive(archive).state, state);
  assert.equal(matchPlayerStats(readableArchive(archive).state).length, 12);
  assert.deepEqual(matchRoster(next), matchRoster(state));
  assert.equal(next.initialRoster, undefined);
  assert.deepEqual(next.log, []);
  assert.ok(matchPlayerStats(next).every((p) => p.matchPoints === 0));
});

test('registry saves a between-set swap atomically and preserves it if a later change fails', async (t) => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const group = await loadDevelopmentGroup(database);
  const registry = [];
  for (let i = 0; i < 12; i++)
    registry.push(await registerPlayer(database, group.id, `Player ${i + 1}`));
  const teams = structuredClone(createMatch().teams);
  for (const [index, id] of (['A', 'B'] as const).entries())
    for (let i = 0; i < 6; i++) teams[id].players[i].personId = registry[index * 6 + i].id;
  const state = close(point(assignMatchPlayers(createMatch(), group.id, teams, registry)));
  await saveStoredMatch(database, state);
  const changes = structuredClone(state.teams);
  [changes.A.players[0].personId, changes.B.players[0].personId] = [
    changes.B.players[0].personId,
    changes.A.players[0].personId,
  ];
  const updated = await saveMatchPlayers(database, state, group.id, changes);
  assert.equal(required(updated.log.at(-1)).type, 'roster');
  assert.deepEqual(await loadStoredMatch(database), updated);
  const original = database.transaction.bind(database);
  database.transaction = (...args) => {
    const transaction = original(...args);
    queueMicrotask(() => transaction.abort());
    return transaction;
  };
  await assert.rejects(saveMatchPlayers(database, updated, group.id, state.teams));
  database.transaction = original;
  assert.deepEqual(await loadStoredMatch(database), updated);
});
