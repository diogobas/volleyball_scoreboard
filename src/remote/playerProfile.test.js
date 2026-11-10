import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPlayerHref, readRoute } from '../public/routes.js';
import { publicPlayerProfile } from './publicStats.js';

const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const playerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('player routes support short references and preserve year, period and match pagination', () => {
  const route = readRoute(
    publicPlayerHref('G-1', 'P-12', { season: 2025, period: 'summer', page: 2, pageSize: 10 }),
  );
  assert.deepEqual(route, {
    kind: 'player',
    groupId: 'G-1',
    matchId: null,
    playerId: 'P-12',
    season: 2025,
    period: 'summer',
    page: 2,
    pageSize: 10,
    view: 'players',
  });
  assert.equal(readRoute(publicPlayerHref(groupId, playerId)).playerId, playerId);
  assert.equal(readRoute('#/groups/g-1/players/p-12').playerId, 'P-12');
  for (const hash of [
    '#/players/P-1',
    '#/groups/G-1/players/P-0',
    '#/groups/G-1/players/P-01',
    '#/groups/G-1/players/G-1',
    '#/groups/G-1/matches/P-1',
  ])
    assert.equal(readRoute(hash).kind, 'missing');
});

test('public player reads are group-scoped and reject incomplete or mismatched profile responses', async () => {
  const data = {
    group: { id: groupId },
    player: { id: playerId, display_id: 'P-1', preferred_positions: [] },
    season: 2026,
    period: 'fall',
    seasons: [2026],
    statistics: { points: 0, matches: 0, wins: 0, days: 0, attendance_day_count: 0 },
    page: 1,
    page_size: 5,
    match_count: 0,
    matches: [],
  };
  const calls = [];
  const client = {
    get from() {
      throw new Error('No global public table reads');
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === 'public_group_info' ? { id: groupId } : structuredClone(data) };
    },
  };
  const options = { season: 2026, period: 'fall' };
  assert.deepEqual(await publicPlayerProfile('G-1', 'P-1', options, client), data);
  assert.deepEqual(calls[1], [
    'public_player_profile',
    {
      p_group_id: groupId,
      p_player_ref: 'P-1',
      p_season: 2026,
      p_period: 'fall',
      p_page: 1,
      p_page_size: 5,
    },
  ]);
  data.group.id = playerId;
  await assert.rejects(publicPlayerProfile(groupId, playerId, options, client), /incomplete/);
  data.group.id = groupId;
  data.period = 'summer';
  await assert.rejects(publicPlayerProfile(groupId, playerId, options, client), /incomplete/);
  data.period = 'fall';
  data.player.id = groupId;
  await assert.rejects(publicPlayerProfile(groupId, playerId, options, client), /incomplete/);
  await assert.rejects(publicPlayerProfile(groupId, playerId, { page: 0 }, client), /Invalid/);
  await assert.rejects(
    publicPlayerProfile(groupId, playerId, options, {
      rpc: async () => ({ error: new Error('Offline') }),
    }),
    /Offline/,
  );
});
