import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMatchStatistics } from '../public/matchStatistics.js';

const fixture = () => ({
  team_a_name: 'Home',
  team_b_name: 'Away',
  sets: [
    {
      number: 1,
      team_a_name: 'Home',
      team_b_name: 'Away',
      score_a: 3,
      score_b: 5,
      errors_a: 1,
      errors_b: 2,
      players: [
        { id: 'alice', name: 'Alice', team: 'A', points: 2 },
        { id: 'bob', name: 'Bob', team: 'A', points: 0 },
        { id: 'chris', name: 'Chris', team: 'B', points: 3 },
      ],
    },
    {
      number: 2,
      team_a_name: 'Home',
      team_b_name: 'Away',
      score_a: 4,
      score_b: 3,
      errors_a: 0,
      errors_b: 1,
      players: [
        { id: 'dani', name: 'Dani', team: 'A', points: 4 },
        { id: 'bob', name: 'Bob', team: 'A', points: 0 },
        { id: 'alice', name: 'Alice', team: 'B', points: 1 },
        { id: 'chris', name: 'Chris', team: 'B', points: 1 },
      ],
    },
  ],
});

test('public match charts aggregate by player identity while retaining team totals and separate errors', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = publicMatchStatistics(input);
  assert.deepEqual(
    result.topPlayers.map((p) => [p.id, p.points]),
    [
      ['chris', 4],
      ['dani', 4],
      ['alice', 3],
    ],
  );
  assert.equal(result.topPlayers.find((p) => p.id === 'alice').teamName, 'Home / Away');
  assert.equal(result.teams[0].players.find((p) => p.id === 'alice').points, 2);
  assert.equal(result.teams[1].players.find((p) => p.id === 'alice').points, 1);
  assert.equal(result.teams[0].players.find((p) => p.id === 'bob').points, 0);
  assert.equal(result.teams[0].players.find((p) => p.isError).points, 1);
  assert.equal(result.teams[1].players.find((p) => p.isError).points, 3);
  assert.equal(
    result.teams[0].players.reduce((sum, p) => sum + p.points, 0),
    7,
  );
  assert.equal(
    result.teams[1].players.reduce((sum, p) => sum + p.points, 0),
    8,
  );
  assert.deepEqual(input, before);
});

test('public set history keeps historical names, scores, zero-point rosters and independent rankings', () => {
  const input = fixture();
  input.sets[0].players[0].name = 'Alice recorded';
  const result = publicMatchStatistics(input);
  assert.equal(result.sets[0].rosters.A[0].name, 'Alice recorded');
  assert.equal(result.sets[0].rosters.A.find((p) => p.id === 'bob').points, 0);
  assert.deepEqual(
    result.sets[0].ranking.map((p) => [p.name, p.points]),
    [
      ['Chris', 3],
      ['Alice recorded', 2],
    ],
  );
  assert.deepEqual(
    result.sets[1].ranking.map((p) => [p.id, p.points]),
    [
      ['dani', 4],
      ['alice', 1],
      ['chris', 1],
    ],
  );
  assert.equal(result.sets[0].scoreA, 3);
  assert.equal(result.sets[0].scoreB, 5);
  assert.equal(result.topPlayers.find((p) => p.id === 'alice').name, 'Alice');
});

test('error-only matches show no top players and retain the error totals', () => {
  const input = fixture();
  for (const set of input.sets) for (const person of set.players) person.points = 0;
  const result = publicMatchStatistics(input);
  assert.deepEqual(result.topPlayers, []);
  assert.ok(result.sets.every((set) => set.ranking.length === 0));
  assert.equal(result.teams[1].players.find((p) => p.isError).points, 3);
});
