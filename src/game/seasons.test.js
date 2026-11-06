import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, matchReducer, restoreMatch } from './match.js';
import { assignMatchPlayers, DEVELOPMENT_GROUP_ID, loadDevelopmentGroup, registerPlayer, saveMatchPlayers } from './registry.js';
import { closeStoredMatch, listStoredMatches, loadStoredMatch, openMatchDatabase, saveStoredMatch } from './storage.js';
import { availableSeasons, groupDate, seasonStatistics } from './seasons.js';

const group = { id: DEVELOPMENT_GROUP_ID, name: 'Test group', timeZone: 'America/Toronto' };
const players = Array.from({ length: 14 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 2).padStart(12, '0')}`, groupId: group.id, name: `Player ${i + 1}`,
}));
function start() {
  const state = createMatch();
  const teams = structuredClone(state.teams);
  for (const [index, id] of ['A', 'B'].entries()) for (let i = 0; i < 6; i++) teams[id].players[i].personId = players[index * 6 + i].id;
  return assignMatchPlayers(state, group.id, teams, players);
}
const point = (state, team = 'A', playerId = 'p1', startedAt = '2026-11-06T18:00:00.000Z') =>
  matchReducer(state, { type: 'point', team, playerId, startedAt });
const close = state => matchReducer(state, { type: 'closeSet' });
const archive = (state, id = 'match', closedAt = '2026-11-06T20:00:00.000Z') => ({ id, state, closedAt, syncStatus: 'pending' });
const row = (totals, index) => totals.rows.find(player => player.personId === players[index].id);

test('season totals include zero-point participants and award wins only to the winning team', () => {
  const state = close(point(point(point(start()), 'B'), 'A', 'err'));
  const totals = seasonStatistics([archive(state)], group, players, '2026');
  assert.equal(totals.includedMatches, 1);
  assert.deepEqual(row(totals, 0), { personId: players[0].id, name: 'Player 1', points: 1, matches: 1, wins: 1, days: 1 });
  assert.equal(row(totals, 1).points, 0);
  assert.equal(row(totals, 1).matches, 1);
  assert.equal(row(totals, 1).wins, 1);
  assert.equal(row(totals, 6).wins, 0);
  assert.equal(row(totals, 12).matches, 0);
  assert.equal(totals.rows.reduce((sum, player) => sum + player.points, 0), 2);
});

test('several matches on the same group date count one attendance, with another day counting separately', () => {
  const first = archive(close(point(start())), 'first');
  const second = archive(close(point(start(), 'A', 'p1', '2026-11-07T03:00:00.000Z')), 'second', '2026-11-07T03:30:00.000Z');
  const third = archive(close(point(start(), 'A', 'p1', '2026-11-07T18:00:00.000Z')), 'third', '2026-11-07T20:00:00.000Z');
  assert.equal(row(seasonStatistics([first, second], group, players, 2026), 0).days, 1);
  const totals = seasonStatistics([first, second, third], group, players, 2026);
  assert.equal(row(totals, 0).matches, 3);
  assert.equal(row(totals, 0).wins, 3);
  assert.equal(row(totals, 0).days, 2);
});

test('year and attendance use group-local start date across midnight, new year and DST', () => {
  const state = close(point(start(), 'A', 'p1', '2027-01-01T02:00:00.000Z'));
  const saved = archive(state, 'new-year', '2027-01-03T18:00:00.000Z');
  assert.equal(groupDate(state.startedAt, group.timeZone), '2026-12-31');
  assert.equal(seasonStatistics([saved], group, players, 2026).includedMatches, 1);
  assert.equal(seasonStatistics([saved], group, players, 2027).includedMatches, 0);
  assert.deepEqual(availableSeasons([saved], group, '2027-01-01T02:00:00.000Z'), ['2026']);
  assert.equal(groupDate('2026-11-01T05:30:00.000Z', group.timeZone), '2026-11-01');
  assert.equal(groupDate('2026-11-01T06:30:00.000Z', group.timeZone), '2026-11-01');
  assert.equal(groupDate(state.startedAt, 'Asia/Tokyo'), '2027-01-01');
});

test('both-team players get one match and no win; exclusive winners retain their win', () => {
  let state = close(point(point(start())));
  const teams = structuredClone(state.teams);
  [teams.A.players[0].personId, teams.B.players[0].personId] = [teams.B.players[0].personId, teams.A.players[0].personId];
  state = assignMatchPlayers(state, group.id, teams, players);
  state = close(point(point(point(state), 'B')));
  const totals = seasonStatistics([archive(state)], group, players, 2026);
  assert.equal(row(totals, 0).points, 3);
  assert.equal(row(totals, 0).matches, 1);
  assert.equal(row(totals, 0).wins, 0);
  assert.equal(row(totals, 6).points, 2);
  assert.equal(row(totals, 6).wins, 0);
  assert.equal(row(totals, 1).wins, 1);
});

test('substitutes and departed players count when they play, while unused selections do not', () => {
  let state = close(point(start()));
  let teams = structuredClone(state.teams);
  teams.A.players[0].personId = players[12].id;
  state = close(point(assignMatchPlayers(state, group.id, teams, players), 'B'));
  teams = structuredClone(state.teams);
  teams.A.players[0].personId = players[13].id;
  state = assignMatchPlayers(state, group.id, teams, players);
  const totals = seasonStatistics([archive(state)], group, players, 2026);
  assert.equal(row(totals, 0).matches, 1);
  assert.equal(row(totals, 12).matches, 1);
  assert.equal(row(totals, 12).points, 0);
  assert.equal(row(totals, 13).matches, 0);
  assert.equal(row(totals, 13).days, 0);
  assert.ok(totals.rows.every(player => player.wins === 0));
});

test('unassociated, unreadable and other-group matches do not contaminate group totals; old dates are marked', () => {
  const legacy = close(point(start()));
  delete legacy.startedAt;
  const unbound = close(point(createMatch()));
  const other = structuredClone(legacy);
  other.groupId = '00000000-0000-4000-8000-999999999999';
  const input = [archive(legacy, 'old'), archive(unbound, 'unbound'), archive(other, 'other'), { unavailable: true }];
  const original = structuredClone(input);
  const totals = seasonStatistics(input, group, players, 2026);
  assert.equal(totals.includedMatches, 1);
  assert.equal(totals.fallbackDates, 1);
  assert.equal(totals.unassociatedMatches, 1);
  assert.equal(totals.unavailableMatches, 1);
  assert.equal(row(totals, 0).matches, 1);
  assert.deepEqual(input, original);
});

test('stable IDs keep namesakes separate and recomputing from changed results does not double-count', () => {
  const state = close(point(start()));
  const namesakes = players.map(player => ({ ...player, name: 'Same name' }));
  const first = seasonStatistics([archive(state)], group, namesakes, 2026);
  assert.equal(first.rows.length, 14);
  assert.equal(row(first, 0).points, 1);
  assert.equal(row(first, 1).points, 0);
  const changed = close(point(start(), 'B'));
  const second = seasonStatistics([archive(changed)], group, namesakes, 2026);
  assert.equal(row(second, 0).points, 0);
  assert.equal(row(second, 0).wins, 0);
  assert.equal(row(second, 6).points, 1);
  assert.equal(row(second, 6).wins, 1);
  assert.equal(row(first, 0).wins, 1);
});

test('first-point timestamp persists across replay and swaps, resets for a new match and clears after undoing all points', () => {
  const first = point(start());
  assert.equal(first.startedAt, '2026-11-06T18:00:00.000Z');
  const later = point(first, 'B', 'p1', '2027-01-02T18:00:00.000Z');
  assert.equal(later.startedAt, first.startedAt);
  assert.deepEqual(restoreMatch(JSON.stringify(later)), later);
  const completed = close(later);
  const teams = structuredClone(completed.teams);
  [teams.A.players[0].personId, teams.B.players[0].personId] = [teams.B.players[0].personId, teams.A.players[0].personId];
  const swapped = assignMatchPlayers(completed, group.id, teams, players);
  assert.equal(swapped.startedAt, first.startedAt);
  assert.deepEqual(restoreMatch(JSON.stringify(swapped)), swapped);
  assert.equal(matchReducer(first, { type: 'undo' }).startedAt, undefined);
  const reset = matchReducer(first, { type: 'reset' });
  assert.equal(reset.startedAt, undefined);
  const old = matchReducer(start(), { type: 'point', team: 'A', playerId: 'p1' });
  assert.equal(point(old).startedAt, undefined);
  assert.equal(restoreMatch(JSON.stringify(old)).startedAt, undefined);
  const invalid = { ...first, startedAt: 'invalid' };
  assert.throws(() => restoreMatch(JSON.stringify(invalid)), /start date/);
});

test('persistence and archive association retain timestamps and immediately include old matches in totals', async t => {
  const database = await openMatchDatabase(new IDBFactory());
  t.after(() => database.close());
  const localGroup = await loadDevelopmentGroup(database);
  const state = close(point(createMatch()));
  await saveStoredMatch(database, state);
  assert.equal((await loadStoredMatch(database)).startedAt, state.startedAt);
  const next = await closeStoredMatch(database, state, { id: 'old-match' });
  assert.equal(next.startedAt, undefined);
  const teams = structuredClone(state.teams);
  const registered = [];
  for (const id of ['A', 'B']) for (let i = 0; i < 6; i++) {
    const player = await registerPlayer(database, localGroup.id, `${id} Player ${i}`);
    registered.push(player);
    teams[id].players[i].personId = player.id;
  }
  assert.equal(seasonStatistics(await listStoredMatches(database), localGroup, registered, 2026).includedMatches, 0);
  await saveMatchPlayers(database, state, localGroup.id, teams, 'old-match');
  const archives = await listStoredMatches(database);
  assert.equal(archives[0].state.startedAt, state.startedAt);
  assert.equal(seasonStatistics(archives, localGroup, registered, 2026).includedMatches, 1);
  assert.deepEqual(await loadStoredMatch(database), next);
});
