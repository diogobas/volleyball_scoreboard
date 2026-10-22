import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchReducer, restoreMatch, teamScore } from './match.js';

const point = (state, team = 'A', playerId = 'p1') => matchReducer(state, { type: 'point', team, playerId });
const close = state => matchReducer(state, { type: 'closeSet' });
const undo = state => matchReducer(state, { type: 'undo' });

test('points and opponent errors count for the selected team without mutating previous state', () => {
  const initial = createMatch();
  const state = point(point(initial), 'B', 'err');
  assert.equal(teamScore(initial.teams.A), 0);
  assert.equal(teamScore(state.teams.A), 1);
  assert.equal(teamScore(state.teams.B), 1);
  assert.equal(state.teams.B.players.at(-1).matchPoints, 1);
  assert.deepEqual(undo(state), point(initial));
});

test('closing a set preserves totals; undo restores set scores and then points', () => {
  const before = point(point(point(createMatch()), 'B'), 'A', 'p2');
  const closed = close(before);
  assert.equal(closed.currentSet, 2);
  assert.equal(closed.teams.A.setsWon, 1);
  assert.equal(teamScore(closed.teams.A), 0);
  assert.equal(closed.teams.A.players[0].matchPoints, 1);
  assert.deepEqual(undo(closed), before);
  const next = point(closed, 'B', 'p2');
  assert.deepEqual(undo(next), closed);
  assert.deepEqual(undo(undo(next)), before);
  assert.equal(undo(before).teams.A.players[1].matchPoints, 0);
});

test('empty sets and empty undo do nothing; a manually closed tie awards no set', () => {
  const state = createMatch();
  assert.equal(close(state), state);
  assert.equal(undo(state), state);
  const tied = close(point(point(state), 'B'));
  assert.equal(tied.teams.A.setsWon, 0);
  assert.equal(tied.teams.B.setsWon, 0);
  assert.equal(tied.currentSet, 2);
});

test('renaming preserves score and historical names; reset keeps names only', () => {
  const scored = point(createMatch());
  const draft = structuredClone(scored.teams);
  draft.A.name = '  Azul  ';
  draft.A.players[0].name = '  Ana  ';
  draft.B.players[0].name = '   ';
  const edited = matchReducer(scored, { type: 'edit', teams: draft });
  assert.equal(edited.teams.A.name, 'Azul');
  assert.equal(edited.teams.A.players[0].name, 'Ana');
  assert.equal(edited.teams.B.players[0].name, 'Chicó');
  assert.equal(edited.log[0].playerName, 'Anderson');
  assert.equal(teamScore(edited.teams.A), 1);
  const reset = matchReducer(close(edited), { type: 'reset' });
  assert.equal(reset.currentSet, 1);
  assert.equal(reset.teams.A.name, 'Azul');
  assert.equal(reset.teams.A.players[0].name, 'Ana');
  assert.equal(reset.teams.A.players[0].matchPoints, 0);
  assert.equal(reset.teams.A.setsWon, 0);
  assert.deepEqual(reset.log, []);
});

test('saved matches restore counters, names, history and undo across set boundaries', () => {
  const scored = close(point(point(point(createMatch()), 'B'), 'A', 'p3'));
  const draft = structuredClone(scored.teams);
  draft.A.name = 'Azul';
  draft.A.players[0].name = '<b>Ana</b>';
  const edited = matchReducer(scored, { type: 'edit', teams: draft });
  const current = point(close(point(edited, 'B')), 'A');
  const restored = restoreMatch(JSON.stringify(current));
  assert.deepEqual(restored, current);
  assert.deepEqual(undo(undo(restored)), undo(undo(current)));
  const corrupt = structuredClone(current);
  corrupt.teams.A.players[0].matchPoints = 999;
  assert.deepEqual(restoreMatch(JSON.stringify(corrupt)), current);
});

test('invalid storage cannot introduce malformed history or players', () => {
  assert.deepEqual(restoreMatch(null), createMatch());
  for (const raw of ['{', '{}', 'null']) assert.throws(() => restoreMatch(raw));
  const invalid = createMatch();
  invalid.log.push({ type: 'point', team: 'C', playerId: 'p1' });
  assert.throws(() => restoreMatch(JSON.stringify(invalid)));
  invalid.log = [{ type: 'set' }];
  assert.throws(() => restoreMatch(JSON.stringify(invalid)));
});
