import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatch, matchReducer, restoreMatch } from './match';
import { historicalErrors, matchResult, validSetScore } from './matchResult';

test('third set victory decides the match permanently, preserving all later training sets', () => {
  const photo = [
    [19, 25],
    [22, 25],
    [16, 25],
    [25, 17],
    [25, 17],
    [15, 12],
  ].map(([score_a, score_b]) => ({ score_a, score_b }));
  const r = matchResult(photo);
  assert.equal(r.winner, 'B');
  assert.equal(r.setsA, 0);
  assert.equal(r.setsB, 3);
  assert.equal(r.decidedAt, 3);
  assert.equal(r.trainingSets, 3);
  assert.equal(matchResult(photo.slice(0, 2)).winner, null);
  let state = createMatch();
  for (const [team, score] of [
    ['A', 1],
    ['A', 1],
    ['A', 1],
    ['B', 1],
    ['B', 1],
    ['B', 1],
  ] as const) {
    for (let i = 0; i < score; i++)
      state = matchReducer(state, { type: 'point', team, playerId: 'p1' });
    state = matchReducer(state, { type: 'closeSet' });
  }
  assert.equal(state.teams.A.setsWon, 3);
  assert.equal(state.teams.B.setsWon, 0);
  assert.equal(state.teams.B.players[0].matchPoints, 3);
  const restored = restoreMatch(JSON.stringify(state));
  assert.equal(restored.teams.B.setsWon, 0);
  assert.equal(matchReducer(restored, { type: 'undo' }).teams.A.setsWon, 3);
});
test('official set endings require the target score and a two-point lead', () => {
  for (const [a, b, target] of [
    [25, 23, 25],
    [27, 25, 25],
    [15, 13, 15],
    [17, 15, 15],
  ])
    assert.equal(validSetScore(a, b, target), true);
  for (const [a, b, target] of [
    [26, 25, 25],
    [27, 23, 25],
    [25, 24, 25],
    [15, 14, 15],
    [14, 12, 15],
  ])
    assert.equal(validSetScore(a, b, target), false);
});

test('score-only historical entry validates scores and team names without requiring player totals', () => {
  const body = {
    played_on: '2026-11-03',
    rules: 'recreational',
    team_a_name: 'Team 1',
    team_b_name: 'Team 2',
    player_totals_recorded: false,
    sets: [{ score_a: 19, score_b: 25, early_finish: false }],
  };
  assert.deepEqual(historicalErrors(body), []);
  assert.ok(historicalErrors({ ...body, team_a_name: '' }).some((e) => e.includes('enter a name')));
  assert.ok(
    historicalErrors({ ...body, sets: [{ score_a: 25, score_b: 24, early_finish: false }] }).length,
  );
});

test('an interrupted historical match can explicitly finish as a draw without changing scores', () => {
  const body = {
    played_on: '2026-10-23',
    rules: 'recreational',
    team_a_name: 'Team 1',
    team_b_name: 'Team 2',
    player_totals_recorded: false,
    ended_as_draw: true,
    sets: [
      [24, 26],
      [25, 20],
      [25, 22],
      [22, 21],
    ].map(([score_a, score_b], i) => ({ score_a, score_b, early_finish: i === 3 })),
  };
  assert.deepEqual(historicalErrors(body), []);
  assert.equal(matchResult(body.sets, { endedAsDraw: true }).winner, null);
  assert.equal(matchResult(body.sets, { endedAsDraw: true }).setsA, 2);
  assert.equal(matchResult(body.sets, { endedAsDraw: true }).setsB, 1);
  const tied = { ...body, sets: body.sets.map((s, i) => (i === 3 ? { ...s, score_b: 22 } : s)) };
  assert.deepEqual(historicalErrors(tied), []);
  assert.equal(matchResult(tied.sets).setsB, 1);
  assert.ok(historicalErrors({ ...tied, ended_as_draw: false }).length);
  assert.ok(
    historicalErrors({ ...tied, sets: tied.sets.map((s) => ({ ...s, early_finish: false })) })
      .length,
  );
  assert.ok(
    historicalErrors({
      ...body,
      sets: [
        { score_a: 25, score_b: 20 },
        { score_a: 25, score_b: 20 },
        { score_a: 25, score_b: 20 },
      ],
    }).some((e) => e.includes('already won')),
  );
  assert.ok(
    historicalErrors({ ...body, sets: [{ score_a: 0, score_b: 0, early_finish: true }] }).length,
  );
  const official = { ...tied, rules: 'official' };
  assert.deepEqual(historicalErrors(official), []);
});
