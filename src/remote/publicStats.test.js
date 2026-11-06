import test from 'node:test';
import assert from 'node:assert/strict';
import { listPublicGroups, publicGroupSummary, publicMatchDetails } from './publicStats.js';
import { publicGroupHref, readRoute } from '../public/routes.js';

const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const matchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('hash routes preserve season and page, support deep links and leave the scoreboard at the default URL', () => {
  for (const hash of ['', '#', '#/', '#/app']) assert.deepEqual(readRoute(hash), { kind: 'app' });
  assert.deepEqual(readRoute('#/groups'), { kind: 'groups' });
  const href = publicGroupHref(groupId, { season: 2025, page: 2, matchId });
  assert.deepEqual(readRoute(href), { kind: 'match', groupId, matchId, season: 2025, page: 2 });
  assert.equal(readRoute(publicGroupHref(groupId)).season, null);
  assert.equal(readRoute(publicGroupHref(groupId, { season: 2025 })).page, 1);
  assert.equal(readRoute(`#/groups/${groupId.toUpperCase()}`).groupId, groupId);
  for (const href of ['#/history', '#/groups/not-a-uuid', `#/groups/${groupId}/matches/no`, `#/groups/${groupId}?season=`,
    `#/groups/${groupId}?season=2026.5`, `#/groups/${groupId}?page=0`, `#/groups/${groupId}?page=100001`, `#/groups/${groupId}?season=<script>`]) {
    assert.equal(readRoute(href).kind, 'missing', href);
  }
});

test('public group discovery paginates beyond one response and requests only public group fields', async () => {
  const groups = Array.from({ length: 161 }, (_, i) => ({ id: `${i}`, name: `Group ${String(i).padStart(3,'0')}`, time_zone: 'UTC' }));
  const calls = [];
  const client = { from: table => {
    assert.equal(table, 'groups');
    return { select: fields => {
      assert.equal(fields, 'id,name,time_zone');
      return { order: order => { assert.equal(order, 'id'); return { range: async (start, end) => {
        calls.push([start,end]); return { data: groups.slice(start, end + 1) };
      } }; } };
    } };
  } };
  assert.deepEqual(await listPublicGroups(client), groups);
  assert.deepEqual(calls, [[0,99],[100,199]]);
});

test('public summaries and details use only read RPCs, keep filters and reject mismatched responses', async () => {
  const calls = [];
  const summary = { group: { id: groupId }, season: 2025, page: 2, page_size: 25, match_count: 26, seasons: [2026,2025],
    matches: [], players: [{ id: 'a', name: 'A', points: 0, wins: 0 }, { id: 'b', name: 'B', points: 3, wins: 1 }] };
  const details = { id: matchId, group_id: groupId, group: { id: groupId }, sets: [] };
  const client = { get auth() { throw new Error('Public readers must not use account operations'); }, rpc: async (name, args) => {
    calls.push([name,args]); return { data: structuredClone(name === 'public_group_summary' ? summary : details) };
  } };
  assert.equal((await publicGroupSummary(groupId,2025,2,client)).players[0].id, 'b');
  assert.deepEqual(await publicMatchDetails(groupId,matchId,client), details);
  assert.deepEqual(calls, [['public_group_summary',{ p_group_id: groupId,p_season: 2025,p_page: 2 }],
    ['public_match_details',{ p_group_id: groupId,p_match_id: matchId }]]);
  summary.group.id = matchId;
  await assert.rejects(publicGroupSummary(groupId,2025,2,client), /incomplete/);
  details.group_id = matchId;
  await assert.rejects(publicMatchDetails(groupId,matchId,client), /incomplete/);
});

test('public read errors propagate instead of presenting a failed request as an empty season', async () => {
  const failure = new Error('Network unavailable');
  await assert.rejects(publicGroupSummary(groupId,2026,1,{ rpc: async () => ({ error: failure }) }), /Network unavailable/);
  await assert.rejects(publicMatchDetails(groupId,matchId,{ rpc: async () => ({ error: failure }) }), /Network unavailable/);
  await assert.rejects(listPublicGroups({ from: () => ({ select: () => ({ order: () => ({ range: async () => ({ error: failure }) }) }) }) }), /Network unavailable/);
});
