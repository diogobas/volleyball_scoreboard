import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {matchResult} from '../src/game/matchResult';

test('historical totals preserve the source photo and first-to-three outcomes, without invented per-set points',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);const owner=randomUUID(),outsider=randomUUID();
 for(const id of [owner,outsider])await q('insert into auth.users values($1,$2,now())',[id,`${id}@test.local`]);
 async function as(user,action,role='authenticated'){await db.exec(`begin;set local role ${role};`);try{await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);const result=await action();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
 const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args),role).then(r=>r.rows[0].data);
 const group=(await as(owner,()=>q("select * from public.create_group('Tuesday Volleyball','America/Toronto')"))).rows[0];
 const payload={format_version:3,id:randomUUID(),group_id:group.id,played_on:'2026-11-03',rules:'recreational',team_a_name:'Team 1',team_b_name:'Team 2',errors_a:50,errors_b:41,
 sets:[[19,25],[22,25],[16,25],[25,17],[25,17],[15,12]].map(([score_a,score_b])=>({score_a,score_b,early_finish:false})),
 players:[['A','Omer',19],['A','Filipe',15],['A','JP',13],['A','Dimitri',10],['A','Kaue',8],['A','Chicó',7],['B','Anderson',19],['B','Diogo',19],['B','Philip',16],['B','Gaëtan',15],['B','Jota',6],['B','Carlos',5]].map(([team,name,points])=>({team,player_id:null,name,points}))};
 const revision=randomUUID();const save=(body=payload,version=null,rev=revision)=>rpc('save_historical_match',[group.id,body,version,'Historical result',rev]);
 const summary=()=>rpc('public_group_summary',[group.id,2026,1],null,'anon');
 let saved;
 await t.test('creation and retry produce one match with Team 2 winning 3–0 and three training sets',async()=>{
  saved=await save();assert.equal(saved.id,payload.id);assert.equal((await save()).version,saved.version);
  const data=await summary();assert.equal(data.match_count,1);assert.equal(data.point_count,243);assert.equal(data.participant_count,12);
  assert.equal(data.matches[0].sets_a,0);assert.equal(data.matches[0].sets_b,3);assert.equal(data.matches[0].winner,'B');assert.equal(data.matches[0].decided_at,3);assert.equal(data.matches[0].sets.length,6);
  assert.equal(data.players.find(p=>p.name==='Omer').points,19);assert.equal(data.players.find(p=>p.name==='Omer').wins,0);assert.equal(data.players.find(p=>p.name==='Anderson').wins,1);assert.equal(data.players.find(p=>p.name==='Anderson').days,1);
  const details=await rpc('public_match_details',[group.id,payload.id],null,'anon');assert.equal(details.players.length,12);assert.equal(details.errors_a,50);assert.equal(details.errors_b,41);
  assert.ok(details.sets.slice(3).every(s=>s.training&&s.statistics_available===false));assert.ok(details.sets.every(s=>s.players.length===0));
  assert.equal((await q('select count(*)::int n from public.match_points where match_id=$1',[payload.id])).rows[0].n,0);
  assert.equal((await rpc('list_group_matches',[group.id,2026,null,'chico',1,5])).total,1);
  assert.equal(matchResult(payload.sets).winner,details.winner);
 });
 await t.test('edit keeps identity, changes totals transactionally, detects stale revisions and preserves retries',async()=>{
  const loaded=await rpc('get_historical_match',[group.id,payload.id]);assert.equal(loaded.version,saved.version);
  const edited=loaded.payload;edited.players.find(p=>p.name==='Omer').points=20;edited.errors_a=49;
  const rev=randomUUID();const updated=await save(edited,loaded.version,rev);assert.equal(updated.version,loaded.version+1);assert.equal((await save(edited,loaded.version,rev)).version,updated.version);
  assert.equal((await summary()).players.find(p=>p.name==='Omer').points,20);
  await assert.rejects(save(edited,loaded.version,randomUUID()),/changed/);
  assert.equal((await summary()).point_count,243);
 });
 await t.test('invalid scores, mismatched totals and unauthorized writes roll back instead of corrupting stats',async()=>{
  const current=await rpc('get_historical_match',[group.id,payload.id]);
  const invalid=structuredClone(current.payload);invalid.players[0].points++;
  await assert.rejects(save(invalid,current.version,randomUUID()),/must equal/);
  const official=structuredClone(payload);official.id=randomUUID();official.rules='official';official.sets[0]={score_a:26,score_b:25,early_finish:true};
  await assert.rejects(save(official,null,randomUUID()),/valid winning score/);
  await assert.rejects(rpc('save_historical_match',[group.id,payload,null,'No',randomUUID()],outsider),/Only group administrators/);
  await assert.rejects(rpc('save_historical_match',[group.id,payload,null,'No',randomUUID()],null,'anon'),/permission denied/);
  assert.equal((await summary()).match_count,1);
 });
 await t.test('official fifth set goes to 15; recreational fifth can close early; training never changes the winner',async()=>{
  const base=structuredClone(payload);base.id=randomUUID();base.rules='official';base.sets=[[25,20],[20,25],[25,20],[20,25],[17,15],[0,25]].map(([score_a,score_b])=>({score_a,score_b,early_finish:false}));
  const scores={A:base.sets.reduce((s,x)=>s+x.score_a,0),B:base.sets.reduce((s,x)=>s+x.score_b,0)};
  base.players.forEach(p=>{p.points=0;});base.errors_a=scores.A;base.errors_b=scores.B;
  const result=await save(base,null,randomUUID());const detail=await rpc('public_match_details',[group.id,result.id],null,'anon');assert.equal(detail.winner,'A');assert.equal(detail.sets_a,3);assert.equal(detail.sets_b,2);assert.equal(detail.sets[5].training,true);
  const rec=structuredClone(base);rec.id=randomUUID();rec.rules='recreational';rec.sets[4]={score_a:12,score_b:9,early_finish:true};rec.errors_a-=5;rec.errors_b-=6;
  await save(rec,null,randomUUID());assert.equal((await rpc('public_match_details',[group.id,rec.id],null,'anon')).winner,'A');
 });
 await t.test('live synced matches use the same third-victory rule while retaining every training point',async()=>{
  const loaded=await rpc('get_historical_match',[group.id,payload.id]);
  const roster=team=>loaded.payload.players.filter(p=>p.team===team).map(p=>({id:p.player_id,name:p.name}));
  const a=roster('A'),b=roster('B');
  const source={format_version:1,id:randomUUID(),group_id:group.id,started_at:'2026-11-04T23:00:00Z',closed_at:'2026-11-05T01:00:00Z',team_a_name:'Team 1',team_b_name:'Team 2',sets:payload.sets.map(set=>({team_a_name:'Team 1',team_b_name:'Team 2',score_a:set.score_a,score_b:set.score_b,rosters:{A:a,B:b},points:[...Array.from({length:set.score_a},()=>({team:'A',player_id:null,player_name:null,is_opponent_error:true})),...Array.from({length:set.score_b},()=>({team:'B',player_id:b[0].id,player_name:b[0].name,is_opponent_error:false}))]}))};
  const sent=await rpc('submit_match',[source]);assert.equal(sent.published,true);
  const detail=await rpc('public_match_details',[group.id,source.id],null,'anon');assert.equal(detail.winner,'B');assert.equal(detail.sets_a,0);assert.equal(detail.sets_b,3);assert.equal(detail.sets[5].training,true);assert.ok(detail.sets.every(set=>set.statistics_available));
  assert.equal((await q('select count(*)::int n from public.match_points where match_id=$1',[source.id])).rows[0].n,243);
 });
 await t.test('score-only results preserve unknown totals, support edits and retries, and never invent players or points',async()=>{
  const body={...structuredClone(payload),id:randomUUID(),player_totals_recorded:false,players:[],errors_a:null,errors_b:null};
  const before=await summary();const token=randomUUID();const created=await save(body,null,token);
  const current=await rpc('get_historical_match',[group.id,body.id]);assert.equal(current.payload.player_totals_recorded,false);assert.deepEqual(current.payload.players,[]);
  const detail=await rpc('public_match_details',[group.id,body.id],null,'anon');assert.equal(detail.player_totals_recorded,false);assert.equal(detail.errors_a,null);assert.equal(detail.errors_b,null);assert.ok(detail.sets.every(s=>s.errors_a===null&&s.errors_b===null));assert.deepEqual(detail.players,[]);assert.equal(detail.sets.length,6);assert.equal(detail.winner,'B');
  const data=await summary();assert.equal(data.unattributed_matches,1);assert.equal(data.point_count,before.point_count+243);assert.deepEqual(data.players,before.players);assert.equal(data.participant_count,before.participant_count);
  assert.equal((await rpc('list_group_matches',[group.id,2026,null,'',1,25])).matches.find(m=>m.id===body.id).player_totals_recorded,false);
  await assert.rejects(save({...body,sets:[{score_a:null,score_b:25,early_finish:true}]},created.version,randomUUID()),/Invalid set score/);
  await assert.rejects(save({...body,errors_a:0},created.version,randomUUID()),/omit player totals/);
  await assert.rejects(save({...body,players:payload.players},created.version,randomUUID()),/omit player totals/);
  const withTotals={...structuredClone(payload),id:body.id,player_totals_recorded:true};const updated=await save(withTotals,created.version,randomUUID());
  assert.equal((await rpc('public_match_details',[group.id,body.id],null,'anon')).player_totals_recorded,true);
  assert.equal((await save(body,null,token)).version,created.version); // A retry must not undo a newer revision.
  assert.equal((await rpc('get_historical_match',[group.id,body.id])).version,updated.version);
  await save(body,updated.version,randomUUID());
  assert.equal((await q('select count(*)::int n from public.match_player_totals where match_id=$1',[body.id])).rows[0].n,0);
  assert.deepEqual((await summary()).players,before.players);
  await q('delete from public.matches where id=$1',[body.id]);
 });
 await t.test('the November 3 maintenance import is repeatable and preserves all six screenshot scores without guessing identities',async()=>{
  const original=(await q('select name from public.groups where id=$1',[group.id])).rows[0].name;
  await q('update public.groups set name=$2 where id=$1',[group.id,'Tuesday Volleyball ‐ 7:30PM-10PM']);
  const sql=(await readFile(new URL('./maintenance/import-tuesday-2026-11-03.sql',import.meta.url),'utf8')).replaceAll('653c2c8d-9903-4410-b109-c66320f7300c',group.id);
  // Existing manual result with these exact scores prevents a second copy.
  await db.exec(sql);assert.equal((await summary()).match_count,4);
  await q('update public.matches set played_on=$2 where id=$1',[payload.id,'2026-11-02']);
  await db.exec(sql);await db.exec(sql);
  const id='8deb93c2-b213-4a36-9026-e56117c03113';const imported=await rpc('public_match_details',[group.id,id],null,'anon');
  const context=(await q('select submission from private.match_metadata where match_id=$1',[id])).rows[0].submission.import_context;
  assert.deepEqual(context.team_changes,[{name:'Chicó',from_team:'B',to_team:'A',after_set:3},{name:'Carlos',from_team:'A',to_team:'B',after_set:3}]);
  assert.equal(context.chico_points_from_set_rankings.reduce((sum,n)=>sum+n,0),12);
  assert.equal((await rpc('get_historical_match',[group.id,id])).payload.import_context,undefined);
  assert.equal(imported.played_on,'2026-11-03');assert.equal(imported.player_totals_recorded,false);assert.equal(imported.winner,'B');assert.equal(imported.decided_at,3);assert.deepEqual(imported.sets.map(s=>[s.score_a,s.score_b]),payload.sets.map(s=>[s.score_a,s.score_b]));
  assert.equal((await summary()).match_count,5);
  await q('delete from public.matches where id=$1',[id]);await q('update public.matches set played_on=$2 where id=$1',[payload.id,'2026-11-03']);
  await q('update public.groups set name=$2 where id=$1',[group.id,original]);
 });
 await t.test('attendance uses distinct recorded dates across the full season and excludes unknown rosters and unpublished matches',async()=>{
  const before=await summary();assert.equal(before.attendance_day_count,2);
  const unknown={...structuredClone(payload),id:randomUUID(),played_on:'2026-11-06',player_totals_recorded:false,players:[],errors_a:null,errors_b:null};
  await save(unknown,null,randomUUID());assert.equal((await summary()).attendance_day_count,2);
  const known={...structuredClone(payload),id:randomUUID(),played_on:'2026-11-07'};
  await save(known,null,randomUUID());const second={...known,id:randomUUID()};await save(second,null,randomUUID());
  const data=await summary();assert.equal(data.attendance_day_count,3);assert.equal(data.players.find(p=>p.name==='Omer').days,before.players.find(p=>p.name==='Omer').days+1);
  const loaded=await rpc('get_historical_match',[group.id,payload.id]);const person=loaded.payload.players[0];const extra=[];
  // Pagination must not change the season-wide denominator.
  for(let day=1;day<=26;day++){
    const id=randomUUID();extra.push(id);const date=`2026-09-${String(day).padStart(2,'0')}`;
    await q("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot,entry_mode,played_on) values($1,$2,$3,0,1,'{}','summary',$4)",[id,group.id,`${date}T16:00:00Z`,date]);
    await q("insert into public.match_player_totals(match_id,group_id,team,player_id,player_name,points,result_team) values($1,$2,'A',$3,$4,0,'A')",[id,group.id,person.player_id,person.name]);
  }
  const page2=await rpc('public_group_summary',[group.id,2026,2],null,'anon');assert.ok(page2.matches.length>0);assert.equal(page2.attendance_day_count,29);assert.equal((await summary()).attendance_day_count,29);
  await q('update public.matches set published=false where id=$1',[extra[0]]);assert.equal((await summary()).attendance_day_count,28);
  await q("update public.matches set played_on='2025-09-02' where id=$1",[extra[1]]);assert.equal((await summary()).attendance_day_count,27);
  const season2027=await rpc('public_group_summary',[group.id,2027,1],null,'anon');assert.equal(season2027.attendance_day_count,0);
  await q('delete from public.matches where id=any($1::uuid[])',[[...extra,unknown.id,known.id,second.id]]);assert.equal((await summary()).attendance_day_count,2);
 });
 await t.test('finalized historical results cannot be deleted and keep public statistics',async()=>{
  const current=await rpc('get_historical_match',[group.id,payload.id]);
  const before=await summary();
  await assert.rejects(rpc('delete_final_match',[group.id,payload.id,current.version,'Remove historical record']),/Finalized matches cannot be deleted/);
  assert.deepEqual(await summary(),before);
 });
});
