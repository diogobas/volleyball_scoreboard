import assert from 'node:assert/strict';
import test from 'node:test';
import { pointEvent, required, setEvent } from '../test/assertions';
import { createMatch, matchReducer, restoreMatch, setRanking, teamScore } from './match';
import type { MatchState, TeamId } from './types';

const point = (state: MatchState, team: TeamId = 'A', playerId = 'p1') =>
  matchReducer(state, { type: 'point', team, playerId });
const close = (state: MatchState) => matchReducer(state, { type: 'closeSet' });
const undo = (state: MatchState) => matchReducer(state, { type: 'undo' });

test('points and opponent errors count for the selected team without mutating previous state', () => {
  const initial = createMatch();
  const state = point(point(initial), 'B', 'err');
  assert.equal(teamScore(initial.teams.A), 0);
  assert.equal(teamScore(state.teams.A), 1);
  assert.equal(teamScore(state.teams.B), 1);
  assert.equal(required(state.teams.B.players.at(-1)).matchPoints, 1);
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
  assert.equal(pointEvent(edited.log[0]).playerName, 'Anderson');
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
  const invalid: Omit<MatchState, 'log'> & { log: unknown[] } = createMatch();
  invalid.log.push({ type: 'point', team: 'C', playerId: 'p1' });
  assert.throws(() => restoreMatch(JSON.stringify(invalid)));
  invalid.log = [{ type: 'set' }];
  assert.throws(() => restoreMatch(JSON.stringify(invalid)));
});

test('switching sides preserves team identity, scores and undo across sets and reloads', () => {
  const before = close(point(point(point(createMatch()), 'B'), 'A', 'p2'));
  const switched = matchReducer(before, { type: 'switchSides' });
  assert.equal(switched.sidesSwapped, false);
  assert.equal(switched.teams, before.teams);
  assert.equal(switched.log, before.log);
  assert.equal(switched.currentSet, before.currentSet);
  const scored = point(switched, 'B', 'p3');
  assert.equal(scored.teams.B.players[2].setPoints, 1);
  assert.equal(teamScore(scored.teams.A), 0);
  assert.deepEqual(restoreMatch(JSON.stringify(scored)), scored);
  assert.deepEqual(undo(scored), switched);
  const reopened = undo(undo(scored));
  assert.equal(reopened.sidesSwapped, false);
  assert.equal(teamScore(reopened.teams.A), 2);
  assert.equal(teamScore(reopened.teams.B), 1);
  assert.equal(reopened.teams.A.setsWon, 0);
  assert.deepEqual(matchReducer(switched, { type: 'switchSides' }), before);
  assert.equal(matchReducer(switched, { type: 'reset' }).sidesSwapped, false);
});

test('matches saved before switch sides was added keep the original layout', () => {
  const previous = point(createMatch());
  delete (previous as Partial<MatchState>).sidesSwapped;
  const restored = restoreMatch(JSON.stringify(previous));
  assert.equal(restored.sidesSwapped, false);
  assert.deepEqual(restored.teams, previous.teams);
  assert.deepEqual(restored.log, previous.log);
});

const scorePoints = (state: MatchState, count: number, team: TeamId = 'A', playerId = 'p1') => {
  for (let i = 0; i < count; i++) state = point(state, team, playerId);
  return state;
};

test('25–23 closes automatically, records the final point and keeps match totals and undo', () => {
  const before = scorePoints(scorePoints(createMatch(), 23, 'B'), 24);
  const closed = point(before, 'A', 'p2');
  assert.equal(closed.currentSet, 2);
  assert.equal(closed.teams.A.setsWon, 1);
  assert.equal(teamScore(closed.teams.A), 0);
  assert.equal(teamScore(closed.teams.B), 0);
  assert.equal(closed.teams.A.players[0].matchPoints, 24);
  assert.equal(closed.teams.A.players[1].matchPoints, 1);
  assert.equal(setEvent(required(closed.log.at(-1))).scoreA, 25);
  assert.equal(setEvent(required(closed.log.at(-1))).scoreB, 23);
  assert.equal(teamScore(undo(closed).teams.A), 25);
  assert.deepEqual(undo(undo(closed)), before);
  assert.deepEqual(restoreMatch(JSON.stringify(closed)), closed);
  assert.deepEqual(restoreMatch(JSON.stringify(undo(closed))), undo(closed));
  assert.deepEqual(undo(point(closed, 'B')), closed);
});

test('24–24 and 25–24 continue, then 26–24 closes automatically', () => {
  let state = scorePoints(scorePoints(createMatch(), 24, 'B'), 24);
  assert.equal(state.currentSet, 1);
  state = point(state);
  assert.equal(state.currentSet, 1);
  assert.equal(teamScore(state.teams.A), 25);
  state = point(state);
  assert.equal(state.currentSet, 2);
  assert.equal(setEvent(required(state.log.at(-1))).scoreA, 26);
  assert.equal(setEvent(required(state.log.at(-1))).scoreB, 24);
});

test('deuce has no upper limit and opponent errors can close a set for team B', () => {
  let state = scorePoints(scorePoints(createMatch(), 24, 'B'), 24);
  for (let i = 0; i < 80; i++) {
    state = point(point(state), 'B');
    assert.equal(state.currentSet, 1);
  }
  state = point(state, 'B');
  assert.equal(state.currentSet, 1);
  state = point(state, 'B', 'err');
  assert.equal(state.currentSet, 2);
  assert.equal(state.teams.B.setsWon, 1);
  assert.equal(setEvent(required(state.log.at(-1))).scoreA, 104);
  assert.equal(setEvent(required(state.log.at(-1))).scoreB, 106);
  assert.equal(required(state.teams.B.players.at(-1)).matchPoints, 1);
  assert.deepEqual(restoreMatch(JSON.stringify(state)), state);
});

test('old saved matches above 25 keep their original points and set boundaries', () => {
  // Simulate history from the previous version, where only manual closure existed.
  const legacy = createMatch();
  legacy.log = Array.from({ length: 30 }, () => ({
    type: 'point',
    team: 'A',
    playerId: 'p1',
    playerName: 'Anderson',
    teamName: 'Team 1',
  }));
  const open = restoreMatch(JSON.stringify(legacy));
  assert.equal(open.currentSet, 1);
  assert.equal(teamScore(open.teams.A), 30);
  const closed = close(open);
  assert.deepEqual(restoreMatch(JSON.stringify(closed)), closed);
  assert.equal(point(open).currentSet, 2);
});

test('set rankings isolate each set, exclude errors and preserve historical names and ties', () => {
  let state = point(point(point(createMatch()), 'B', 'p2'), 'A', 'p2');
  state = close(point(state, 'B', 'err'));
  const firstRanking = setRanking(state, 1);
  assert.deepEqual(
    firstRanking.map((p) => [p.teamId, p.id, p.points]),
    [
      ['A', 'p1', 1],
      ['A', 'p2', 1],
      ['B', 'p2', 1],
    ],
  );
  const draft = structuredClone(state.teams);
  draft.A.players[0].name = 'Renamed';
  state = matchReducer(state, { type: 'edit', teams: draft });
  state = close(scorePoints(point(state), 2, 'B', 'p3'));
  assert.deepEqual(setRanking(state, 1), firstRanking);
  assert.deepEqual(
    setRanking(state, 2).map((p) => [p.name, p.points]),
    [
      ['Diogo', 2],
      ['Renamed', 1],
    ],
  );
  assert.deepEqual(setRanking(restoreMatch(JSON.stringify(state)), 1), firstRanking);
  assert.deepEqual(
    setRanking(matchReducer(state, { type: 'switchSides' }), 2),
    setRanking(state, 2),
  );
  assert.deepEqual(setRanking(close(point(createMatch(), 'B', 'err')), 1), []);
});

test('manual and automatic set closures swap sides and undo restores them after reload', () => {
  const before = point(createMatch());
  const closed = close(before);
  assert.equal(closed.sidesSwapped, true);
  const second = close(point(closed, 'B'));
  assert.equal(second.sidesSwapped, false);
  assert.deepEqual(undo(restoreMatch(JSON.stringify(second))), point(closed, 'B'));
  assert.deepEqual(undo(restoreMatch(JSON.stringify(closed))), before);

  const switched = matchReducer(createMatch(), { type: 'switchSides' });
  const almost = scorePoints(switched, 24);
  const automatic = point(almost);
  assert.equal(automatic.sidesSwapped, false);
  assert.equal(automatic.currentSet, 2);
  assert.equal(restoreMatch(JSON.stringify(automatic)).sidesSwapped, false);
  assert.equal(undo(restoreMatch(JSON.stringify(automatic))).sidesSwapped, true);
  assert.deepEqual(undo(undo(automatic)), almost);
  assert.equal(close(point(point(createMatch()), 'B')).sidesSwapped, true);
});

test('old set history keeps saved sides when restored and undone', () => {
  for (const sidesSwapped of [true, false]) {
    const legacy = close(point(createMatch()));
    legacy.sidesSwapped = sidesSwapped;
    delete setEvent(required(legacy.log.at(-1))).sidesSwappedBefore;
    const restored = restoreMatch(JSON.stringify(legacy));
    assert.deepEqual(restored, legacy);
    assert.equal(undo(restored).sidesSwapped, sidesSwapped);
  }
});
