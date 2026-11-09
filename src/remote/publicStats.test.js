import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCommunity, publicGroupSummary, publicMatchDetails } from './publicStats.js';
import { publicMatchStatistics } from '../public/matchStatistics.js';
import { publicCommunityHref, publicGroupHref, readRoute } from '../public/routes.js';

const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const matchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('hash routes preserve season and page, support deep links and leave the scoreboard at the default URL', () => {
  for (const hash of ['', '#', '#/', '#/app']) assert.deepEqual(readRoute(hash), { kind: 'app' });
  for (const hash of ['', '#', '#/']) assert.deepEqual(readRoute(hash,'public'), { kind: 'directory' });
  assert.deepEqual(readRoute('#/app','public'), { kind: 'app' });
  assert.deepEqual(readRoute('#/groups'), { kind: 'directory' });
  const href = publicGroupHref(groupId, { season: 2025, page: 2, matchId });
  assert.deepEqual(readRoute(href), { kind: 'match', groupId, matchId, season: 2025, page: 2, view: 'matches', pageSize: 5 });
  assert.equal(readRoute(publicGroupHref(groupId)).season, null);
  assert.equal(readRoute(publicGroupHref(groupId)).view, 'overview');
  for (const pageSize of [5,10,25]) assert.equal(readRoute(publicGroupHref(groupId,{view:'matches',pageSize})).pageSize,pageSize);
  assert.equal(readRoute(`#/groups/${groupId}?size=0`).kind,'missing');
  assert.equal(readRoute(`#/groups/${groupId}?size=100`).kind,'missing');
  for (const view of ['overview','players','matches']) {
    const route = readRoute(publicGroupHref(groupId, { season: 2025, page: 2, view }));
    assert.equal(route.view, view); assert.equal(route.season, 2025); assert.equal(route.page, 2);
  }
  assert.equal(readRoute(`#/groups/${groupId}/matches/${matchId}?season=2025&page=2`).view,'matches');
  assert.equal(readRoute(`#/groups/${groupId}?view=unknown`).kind,'missing');
  assert.equal(readRoute(publicGroupHref(groupId, { season: 2025 })).page, 1);
  assert.equal(readRoute(`#/groups/${groupId.toUpperCase()}`).groupId, groupId);
  for (const href of ['#/history', '#/groups/not-a-uuid', `#/groups/${groupId}/matches/no`, `#/groups/${groupId}?season=`,
    `#/groups/${groupId}?season=2026.5`, `#/groups/${groupId}?page=0`, `#/groups/${groupId}?page=100001`, `#/groups/${groupId}?season=<script>`]) {
    assert.equal(readRoute(href).kind, 'missing', href);
  }
});

test('public community reads require an explicit scope and never enumerate global tables', async () => {
  const data = { community: { id: 'community-id', display_id: 'C-1', name: 'Montreal Volleyball Community' }, groups: [{ id: groupId, name: 'One group' }] };
  const client = { get from() { throw new Error('Global public tables must never be read'); }, rpc: async (name, args) => {
    assert.equal(name, 'public_community'); assert.deepEqual(args, { p_community_ref: 'C-1' }); return { data };
  } };
  assert.deepEqual(await publicCommunity('C-1', client), data);
  assert.deepEqual(readRoute(publicCommunityHref('C-1')), { kind: 'community', communityId: 'C-1' });
  assert.equal(readRoute('#/communities/C-0').kind, 'missing');
  await assert.rejects(publicCommunity('C-1', { rpc: async () => ({ data: {} }) }), /incomplete/);
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
  await assert.rejects(publicCommunity('C-1', { rpc: async () => ({ error: failure }) }), /Network unavailable/);
});


test('display pagination spans server batches without losing matches or changing season totals',async()=>{
  const all=Array.from({length:56},(_,i)=>({id:`match-${i}`})); const calls=[];
  const client={rpc:async(_name,args)=>{calls.push(args);return {data:{group:{id:groupId},season:args.p_season??2026,page:args.p_page,page_size:25,match_count:all.length,
    seasons:[2026],players:[],point_count:1234,matches:all.slice((args.p_page-1)*25,args.p_page*25)}};}};
  const boundary=await publicGroupSummary(groupId,null,3,client,10);
  assert.deepEqual(boundary.matches,all.slice(20,30));assert.equal(boundary.page,3);assert.equal(boundary.page_size,10);assert.equal(boundary.point_count,1234);assert.equal(boundary.match_count,56);
  assert.deepEqual(calls.map(c=>[c.p_page,c.p_season]),[[1,null],[2,2026]]);
  const ids=[];for(let page=1;page<=12;page++)ids.push(...(await publicGroupSummary(groupId,2026,page,client,5)).matches.map(m=>m.id));
  assert.deepEqual(ids,all.map(m=>m.id));assert.equal(new Set(ids).size,56);
  assert.equal((await publicGroupSummary(groupId,2026,13,client,5)).matches.length,0);
  await assert.rejects(publicGroupSummary(groupId,2026,0,client,5),/Invalid/);
  await assert.rejects(publicGroupSummary(groupId,2026,1,client,100),/Invalid/);
});

test('short group references support public links and resolve to the existing UUID', async()=>{
  const matchRoute=readRoute(publicGroupHref('G-1',{season:2026,matchId}));
  assert.equal(matchRoute.kind,'match'); assert.equal(matchRoute.groupId,'G-1');
  assert.equal(readRoute('#/groups/g-12').groupId,'G-12');
  for(const value of ['G-0','G-01','G--1','P-1']) assert.equal(readRoute(`#/groups/${value}`).kind,'missing');
  const calls=[];
  const client={get from(){throw new Error('No global public table reads');},rpc:async(name,args)=>{
    if(name==='public_group_info'){assert.equal(args.p_group_ref,'G-1');return {data:{id:groupId}};}
    calls.push([name,args]);
    return {data:name==='public_group_summary'?{group:{id:groupId,display_id:'G-1'},season:2026,page:1,page_size:25,match_count:0,seasons:[2026],players:[],matches:[]}:
      {id:matchId,group_id:groupId,group:{id:groupId,display_id:'G-1'},sets:[]}};
  }};
  assert.equal((await publicGroupSummary('G-1',null,1,client)).group.id,groupId);
  assert.equal((await publicMatchDetails('g-1',matchId,client)).group_id,groupId);
  assert.ok(calls.every(([,args])=>args.p_group_id===groupId));
  const missing={rpc:async()=>({data:null})};
  await assert.rejects(publicGroupSummary('G-999',null,1,missing),/Group not found/);
});

test('score-only statistics retain set history while hiding unknown player totals and opponent errors', () => {
  const summary={entry_mode:'summary',player_totals_recorded:false,team_a_name:'Team 1',team_b_name:'Team 2',players:[],errors_a:null,errors_b:null,decided_at:3,
    sets:[[19,25],[22,25],[16,25],[25,17],[25,17],[15,12]].map(([score_a,score_b],i)=>({number:i+1,score_a,score_b,team_a_name:'Team 1',team_b_name:'Team 2',players:[],statistics_available:false}))};
  const view=publicMatchStatistics(summary);assert.equal(view.showPlayerTotals,false);assert.deepEqual(view.teams,[]);assert.deepEqual(view.topPlayers,[]);assert.equal(view.sets.length,6);assert.equal(view.sets[3].training,true);assert.equal(view.sets[0].statisticsAvailable,false);
  const recorded=publicMatchStatistics({...summary,player_totals_recorded:true,players:[{id:'p1',name:'Omer',team:'A',points:19}],errors_a:103,errors_b:121});
  assert.equal(recorded.showPlayerTotals,true);assert.equal(recorded.topPlayers[0].points,19);assert.equal(recorded.teams[0].players.find(p=>p.isError).points,103);
});

test('historical points from both teams combine into one player ranking', () => {
 const view=publicMatchStatistics({entry_mode:'summary',player_totals_recorded:true,team_a_name:'Team 1',team_b_name:'Team 2',errors_a:50,errors_b:41,sets:[],
 players:[{id:'chico',name:'Chicó',team:'A',points:7},{id:'chico',name:'Chicó',team:'B',points:5},{id:'carlos',name:'Carlos',team:'B',points:0}]});
 assert.equal(view.topPlayers.length,1);assert.equal(view.topPlayers[0].points,12);assert.deepEqual(view.topPlayers[0].teamIds,['A','B']);
 assert.equal(view.teams[0].players.find(p=>p.id==='chico').points,7);assert.equal(view.teams[1].players.find(p=>p.id==='chico').points,5);
});

test('period pagination keeps the period on every server batch and rejects mismatched totals', async () => {
  const calls = [];
  const all = Array.from({ length: 30 }, (_, i) => ({ id: `match-${i}` }));
  let responsePeriod = 'fall';
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'public_group_period_summary'); calls.push(args);
    return { data: { group: { id: groupId }, season: 2026, period: responsePeriod, page: args.p_page, page_size: 25,
      match_count: 30, seasons: [2026], players: [], matches: all.slice((args.p_page - 1) * 25, args.p_page * 25) } };
  } };
  const data = await publicGroupSummary(groupId, 2026, 3, client, 10, 'fall');
  assert.deepEqual(data.matches, all.slice(20, 30));
  assert.ok(calls.every(args => args.p_period === 'fall' && args.p_season === 2026));
  responsePeriod = 'summer';
  await assert.rejects(publicGroupSummary(groupId, 2026, 1, client, 5, 'fall'), /incomplete/);
});
