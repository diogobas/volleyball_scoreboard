import assert from 'node:assert/strict';
import test from 'node:test';
import { errorCode } from '../game/errors';
import type { TeamId } from '../game/types';
import {
  addPoint,
  correctionErrors,
  editPoint,
  mergeSets,
  moveBoundary,
  recount,
  removeEmptySet,
  removePoint,
  replaceParticipant,
  splitSet,
} from '../public/corrections';
import { required } from '../test/assertions';
import type { TestRpcArgs } from '../test/rpc';
import { correctMatch, getMatchForEdit, matchRevisionHistory } from './matchAdministration';
import type { RpcResponse } from './transport';

const groupId = '11111111-1111-4111-8111-111111111111';
const matchId = '22222222-2222-4222-8222-222222222222';
const players = Array.from({ length: 13 }, (_, i) => ({ id: `person-${i}`, name: `Person ${i}` }));
const point = (team: TeamId, index: number | null) => ({
  team,
  player_id: index === null ? null : players[index].id,
  player_name: index === null ? null : players[index].name,
  is_opponent_error: index === null,
});
const fixture = () =>
  recount({
    format_version: 1,
    id: matchId,
    group_id: groupId,
    started_at: null,
    closed_at: '2026-11-06T23:00:00.000Z',
    team_a_name: 'A',
    team_b_name: 'B',
    sets: [
      {
        team_a_name: 'A',
        team_b_name: 'B',
        rosters: { A: players.slice(0, 6), B: players.slice(6, 12) },
        points: [point('A', 0), point('B', 6), point('A', null), point('B', 7), point('A', 1)],
      },
      {
        team_a_name: 'A',
        team_b_name: 'B',
        rosters: { A: players.slice(0, 6), B: players.slice(6, 12) },
        points: [point('A', 2), point('B', null), point('A', 0)],
      },
    ],
  });

test('participant replacements reassign only that team/set while preserving other points and the input', () => {
  const original = fixture();
  const before = structuredClone(original);
  const edited = replaceParticipant(original, 0, 'A', 0, players[12]);
  assert.equal(edited.sets[0].points[0].player_id, players[12].id);
  assert.equal(edited.sets[1].points[2].player_id, players[0].id);
  assert.deepEqual(original, before);
  assert.deepEqual(correctionErrors(edited, players), []);
  const duplicate = replaceParticipant(original, 0, 'A', 0, players[1]);
  assert.match(correctionErrors(duplicate, players).join(), /no repeats/);
  const switchedSide = replaceParticipant(original, 0, 'A', 0, players[6]);
  assert.deepEqual(correctionErrors(switchedSide, players), []);
});

test('point authors, team changes, additions and removals derive scores and require explicit attribution', () => {
  let payload = addPoint(fixture(), 0);
  assert.match(correctionErrors(payload, players).join(), /select a scorer/i);
  payload = editPoint(payload, 0, 5, { team: 'B', scorer: players[8].id });
  assert.equal(payload.sets[0].score_b, 3);
  assert.deepEqual(correctionErrors(payload, players), []);
  payload = editPoint(payload, 0, 0, { team: 'B' });
  assert.equal(payload.sets[0].points[0].player_id, null);
  assert.match(correctionErrors(payload, players).join(), /scorer/);
  payload = editPoint(payload, 0, 0, { scorer: 'err' });
  assert.deepEqual(payload.sets[0].points[0], point('B', null));
  payload = removePoint(payload, 0, 5);
  assert.equal(payload.sets[0].points.length, 5);
  assert.equal(payload.sets[0].score_a, 2);
});

test('splits, merges and boundary moves preserve every point in order and reject incompatible merges', () => {
  const original = fixture();
  const points = original.sets.flatMap((set) => set.points);
  const split = splitSet(original, 0, 2);
  assert.equal(split.sets.length, 3);
  assert.deepEqual(
    split.sets.flatMap((set) => set.points),
    points,
  );
  assert.deepEqual(mergeSets(split, 0), original);
  const moved = moveBoundary(original, 0, 1);
  assert.equal(moved.sets[0].points.length, 1);
  assert.equal(moved.sets[1].points.length, 7);
  assert.deepEqual(
    moved.sets.flatMap((set) => set.points),
    points,
  );
  assert.throws(() => splitSet(original, 0, 0), /boundary/);
  assert.throws(() => moveBoundary(original, 0, 8), /boundary/);
  assert.throws(
    () => mergeSets(replaceParticipant(original, 1, 'A', 0, players[12]), 0),
    /lineups/,
  );
  assert.deepEqual(
    original.sets.flatMap((set) => set.points),
    points,
  );
});

test('only empty sets can be removed and at least one completed set must remain', () => {
  let payload = fixture();
  while (payload.sets[1].points.length) payload = removePoint(payload, 1, 0);
  assert.match(correctionErrors(payload, players).join(), /empty set/);
  payload = removeEmptySet(payload, 1);
  assert.equal(payload.sets.length, 1);
  assert.throws(() => removeEmptySet(payload, 0), /keep at least one/);
  assert.throws(() => removeEmptySet(fixture(), 0), /Only empty sets/);
});

const server = () => {
  let user: string | null = 'administrator';
  const calls: [string, TestRpcArgs][] = [];
  const payload = fixture();
  const client = {
    auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }) },
    rpc: async (name: string, args: TestRpcArgs): Promise<RpcResponse> => {
      calls.push([name, args]);
      if (name === 'get_match_for_edit')
        return { data: { group: { id: groupId }, payload, version: 1, players } };
      if (name === 'match_revision_history')
        return {
          data: {
            match_id: matchId,
            group_id: groupId,
            page: args.p_page,
            page_size: 20,
            total: 0,
            revisions: [],
          },
        };
      return {
        data: {
          status: 'corrected',
          match_id: matchId,
          group_id: groupId,
          revision_id: args.p_revision_id,
          version: args.p_expected_version + 1,
          current_version: args.p_expected_version + 1,
        },
      };
    },
  };
  return {
    client,
    calls,
    setUser: (value: string | null) => {
      user = value;
    },
  };
};
const correction = () => ({
  groupId,
  matchId,
  version: 1,
  payload: editPoint(fixture(), 0, 0, { scorer: players[1].id }),
  reason: ' Fix author ',
  revisionId: '33333333-3333-4333-8333-333333333333',
});

test('administrator APIs preserve version/revision identity and never accept an actor supplied by the form', async () => {
  const remote = server();
  assert.equal((await getMatchForEdit(groupId, matchId, remote.client)).version, 1);
  assert.equal((await correctMatch(correction(), remote.client)).version, 2);
  assert.equal((await matchRevisionHistory(groupId, matchId, 1, remote.client)).total, 0);
  const [, args] = remote.calls[1];
  assert.equal(args.p_expected_version, 1);
  assert.equal(args.p_reason, 'Fix author');
  assert.equal(args.p_revision_id, correction().revisionId);
  assert.equal('author_id' in args, false);
  await assert.rejects(correctMatch({ ...correction(), reason: '  ' }, remote.client), /reason/);
  assert.equal(remote.calls.length, 3);
});

test('expired sessions and changed accounts cannot expose an admin response as confirmed', async () => {
  const remote = server();
  remote.setUser(null);
  await assert.rejects(getMatchForEdit(groupId, matchId, remote.client), /Sign in/);
  assert.equal(remote.calls.length, 0);
  remote.setUser('administrator');
  const original = remote.client.rpc;
  remote.client.rpc = async (...args) => {
    const result = await original(...args);
    remote.setUser('other');
    return result;
  };
  await assert.rejects(correctMatch(correction(), remote.client), /account changed/);
});

test('stale-version errors and lost confirmations preserve the requested revision ID for a safe retry', async () => {
  const remote = server();
  const args = correction();
  let attempts = 0;
  remote.client.rpc = async (_name: string, body: TestRpcArgs): Promise<RpcResponse> => {
    assert.equal(body.p_revision_id, args.revisionId);
    attempts++;
    if (attempts === 1) return { error: { code: '40001', message: 'Load the latest version' } };
    if (attempts === 2) throw new Error('Response lost');
    return {
      data: {
        status: 'already_corrected',
        match_id: matchId,
        group_id: groupId,
        revision_id: args.revisionId,
        version: 2,
        current_version: 3,
      },
    };
  };
  await assert.rejects(correctMatch(args, remote.client), (error) => errorCode(error) === '40001');
  await assert.rejects(correctMatch(args, remote.client), /Response lost/);
  assert.equal((await correctMatch(args, remote.client)).status, 'already_corrected');
});

test('mismatched edit, audit and correction responses are rejected', async () => {
  const remote = server();
  const original = remote.client.rpc;
  remote.client.rpc = async (name: string, args: TestRpcArgs): Promise<RpcResponse> => {
    const result = await original(name, args);
    const data = result.data as { group?: { id: string }; match_id?: string };
    if (name === 'get_match_for_edit') required(data.group).id = 'wrong';
    else data.match_id = 'wrong';
    return result;
  };
  await assert.rejects(getMatchForEdit(groupId, matchId, remote.client), /incomplete/);
  await assert.rejects(correctMatch(correction(), remote.client), /incomplete/);
  await assert.rejects(matchRevisionHistory(groupId, matchId, 1, remote.client), /incomplete/);
});

test('offline corrections make no remote call and keep the original draft reusable', async (t) => {
  const remote = server();
  const draft = correction();
  const before = structuredClone(draft);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis.navigator, 'onLine', descriptor);
    else Reflect.deleteProperty(globalThis.navigator, 'onLine');
  });
  await assert.rejects(correctMatch(draft, remote.client), /internet connection/);
  assert.deepEqual(draft, before);
  assert.equal(remote.calls.length, 0);
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  assert.equal((await correctMatch(draft, remote.client)).version, 2);
});

test('a timed-out correction response cannot be presented later as a new confirmation', async (t) => {
  const remote = server();
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrival = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const original = remote.client.rpc;
  remote.client.rpc = async (...args) => {
    const result = await original(...args);
    reached();
    await gate;
    return result;
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request = correctMatch(correction(), remote.client);
  await arrival;
  const rejected = assert.rejects(request, /timed out/);
  t.mock.timers.tick(45_001);
  await rejected;
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.reset();
  remote.client.rpc = original;
  assert.equal((await correctMatch(correction(), remote.client)).version, 2);
});
