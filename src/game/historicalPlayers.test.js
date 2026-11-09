import test from 'node:test';
import assert from 'node:assert/strict';
import { competitiveTeam, updateHistoricalPlayer } from './historicalPlayers.js';
import { historicalErrors } from './matchResult.js';

test('changing teams keeps separate points and synchronizes the competitive team for one identity',()=>{
 let players=[{team:'A',player_id:'chico',name:'Chicó',points:7},{team:'B',player_id:null,name:'',points:5}];
 players=updateHistoricalPlayer(players,1,{player_id:'chico',name:'Chicó'});
 assert.equal(competitiveTeam(players[1]),'A');
 players=updateHistoricalPlayer(players,0,{result_team:'B'});
 assert.deepEqual(players.map(p=>p.result_team),['B','B']);assert.deepEqual(players.map(p=>p.points),[7,5]);
 players=updateHistoricalPlayer(players,1,{result_team:null});assert.deepEqual(players.map(p=>p.result_team),[null,null]);
 players=updateHistoricalPlayer(players,1,{name:'Carlos',player_id:'carlos'});assert.equal(players[1].result_team,'B');assert.equal(players[0].result_team,null);
});

test('historical validation accepts a swap and rejects duplicates within a team or conflicting win attribution',()=>{
 const body={played_on:'2026-11-03',rules:'recreational',team_a_name:'Team 1',team_b_name:'Team 2',sets:[{score_a:19,score_b:25,early_finish:false}],errors_a:12,errors_b:20,
  players:['A','B'].flatMap(team=>Array.from({length:6},(_,i)=>({team,player_id:`${team}-${i}`,name:`${team} ${i}`,points:0})))};
 body.players[0]={team:'A',player_id:'chico',name:'Chicó',points:7,result_team:'B'};
 body.players[6]={team:'B',player_id:'chico',name:'Chicó',points:5,result_team:'B'};
 assert.deepEqual(historicalErrors(body),[]);
 const conflicting=structuredClone(body);conflicting.players[0].result_team='A';assert.ok(historicalErrors(conflicting).some(e=>e.includes('same competitive team')));
 const duplicate=structuredClone(body);duplicate.players.push({...body.players[0],points:0});assert.ok(historicalErrors(duplicate).some(e=>e.includes('same team')));
});
