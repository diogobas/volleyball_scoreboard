import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, enableCourtMode, matchReducer } from '../src/game/match.js';
import { applyDayLineup, receivedMatchPayload } from '../src/game/gameDay.js';
import { editPoint } from '../src/public/corrections.js';

const latest='20261108000700_completed_match_sync_and_management.sql';
test('sync finalizes results atomically; administrators can search, edit and delete without day publication',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;revoke all on auth.users from public,anon,authenticated;`);
 for(const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')&&file<latest).sort())await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);const owner=randomUUID(),other=randomUUID();
 for(const id of [owner,other])await q('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`]);
 async function as(user,action,role='authenticated'){await db.exec(`begin;set local role ${role};`);try{await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);const result=await action();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
 const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args),role).then(r=>r.rows[0].data);
 const group=(await as(owner,()=>q("select * from public.create_group('Tuesday','America/Toronto')"))).rows[0];
 const players=Array.from({length:12},(_,i)=>({id:randomUUID(),name:i===5?'Chicó':`Person ${i+1}`}));
 for(const p of players)await rpc('save_group_player',[group.id,p.id,p.name,'fixed',null]);
 const lineup={A:{name:'Home',players:players.slice(0,6)},B:{name:'Away',players:players.slice(6)}};
 const day=await rpc('create_game_day',[group.id,'2026-11-08',lineup]);
 const context={...(await rpc('redeem_day_code',[day.code],null,'anon')),code:day.code};
 function raw(){let state=applyDayLineup(enableCourtMode(createMatch()),context);
  state=matchReducer(state,{type:'point',team:'A',playerId:'p1',startedAt:'2026-11-08T23:00:00Z'});
  const teams=structuredClone(state.teams);teams.A.players[0].name='Substitute';state=matchReducer(state,{type:'edit',teams});
  for(const [team,playerId]of [['A','p1'],['B','p1'],['A','err']])state=matchReducer(state,{type:'point',team,playerId});
  state=matchReducer(state,{type:'closeSet'});
  return receivedMatchPayload({id:randomUUID(),formatVersion:1,closedAt:'2026-11-09T01:00:00Z',state});
 }
 const before=raw();await rpc('receive_day_match',[day.code,before],null,'anon');
 assert.equal((await q('select count(*)::int n from public.matches')).rows[0].n,0);
 await db.exec(await readFile(new URL(`./migrations/${latest}`,import.meta.url),'utf8'));
 const receive=p=>rpc('receive_day_match',[day.code,p],null,'anon');
 const summary=()=>rpc('public_group_summary',[group.id,2026,1],null,'anon');
 const load=id=>rpc('get_match_for_edit',[group.id,id]);
 const list=(query='',page=1,size=5,dayId=null)=>rpc('list_group_matches',[group.id,2026,dayId,query,page,size]);
 await t.test('migration completes previous pending matches and preserves names, substitutions, points and raw receipts',async()=>{
  const data=await summary();assert.equal(data.match_count,1);assert.equal(data.point_count,4);
  const registry=await rpc('get_group_registry',[group.id]);const sub=registry.players.find(p=>p.name==='Substitute');assert.equal(sub.category,'sub');
  assert.equal(registry.players.find(p=>p.id===players[0].id).category,'fixed');
  assert.equal(data.players.find(p=>p.id===sub.id).points,1);assert.equal(data.players.find(p=>p.id===players[0].id).points,1);
  const receipt=(await q('select * from private.day_receipts where id=$1',[before.id])).rows[0];assert.equal(receipt.decision,'approved');assert.deepEqual(receipt.submission,before);
  const details=await rpc('public_match_details',[group.id,before.id],null,'anon');assert.equal(details.sets[0].errors_a,1);assert.equal(details.sets[0].players.filter(p=>p.team==='A').length,7);
  assert.equal((await receive(before)).published,true);assert.equal((await summary()).match_count,1);
 });
 let sent;
 await t.test('new uploads are final immediately and retries preserve later corrections, even on closed days',async()=>{
  sent=raw();const ack=await receive(sent);assert.equal(ack.published,true);assert.deepEqual(ack.submission,sent);assert.equal((await summary()).match_count,2);
  const current=await load(sent.id);const corrected=editPoint(current.payload,0,0,{scorer:players[1].id});corrected.team_a_name='Red';corrected.sets[0].team_a_name='Red';const revision=randomUUID();
  const args=[group.id,sent.id,current.version,corrected,'Correct scorer',revision];
  assert.equal((await rpc('correct_match',args)).status,'corrected');assert.equal((await rpc('correct_match',args)).status,'already_corrected');
  assert.equal((await rpc('public_match_details',[group.id,sent.id],null,'anon')).sets[0].players.find(p=>p.id===players[0].id).points,0);
  await receive(sent);assert.deepEqual((await load(sent.id)).payload,corrected);
  await assert.rejects(rpc('correct_match',[group.id,sent.id,current.version,current.payload,'Stale',randomUUID()]),/changed/);
  const d=await rpc('get_game_day',[day.day.id]);await rpc('change_game_day',[day.day.id,d.day.version,'close',null,'End day']);
  const late=raw();assert.equal((await receive(late)).published,true);assert.equal((await summary()).match_count,3);
  const history=await rpc('match_revision_history',[group.id,sent.id,1]);assert.equal(history.total,1);
 });
 await t.test('search covers names, teams and local dates, paginates, and restricts access to the group',async()=>{
  assert.equal((await list('Substitute')).total,3);assert.equal((await list('chico')).total,3);assert.equal((await list('away')).total,3);assert.equal((await list('Red')).total,1);assert.equal((await list('2026-11-08')).total,3);
  assert.equal((await list('absent')).total,0);assert.equal((await list('',1,5,day.day.id)).total,3);
  for(let i=0;i<4;i++)await receive(raw());
  const page=await list('',2);assert.equal(page.total,7);assert.equal(page.matches.length,2);
  await assert.rejects(rpc('list_group_matches',[group.id,null,null,'',1,5],other),/Only group administrators/);
  await assert.rejects(rpc('list_group_matches',[group.id,null,null,'',1,5],null,'anon'),/permission denied/);
  await assert.rejects(rpc('delete_final_match',[group.id,sent.id,1,'Delete'],other),/Only group administrators/);
 });
 await t.test('invalid or duplicate identities roll back receipt, registration and public results together',async()=>{
  const bad=raw();for(const set of bad.sets)for(const seg of set.segments){const person=seg.rosters.A[5];person.name=seg.rosters.A[4].name;person.hint_id=null;}
  const count=(await summary()).match_count;const registry=(await rpc('get_group_registry',[group.id])).players.length;
  await assert.rejects(receive(bad),/twelve different/);assert.equal((await summary()).match_count,count);
  assert.equal((await rpc('get_group_registry',[group.id])).players.length,registry);
  assert.equal((await q('select count(*)::int n from private.day_receipts where id=$1',[bad.id])).rows[0].n,0);
  const invalid=raw();invalid.sets[0].score_a++;await assert.rejects(receive(invalid),/Scores do not match/);
  await assert.rejects(as(null,()=>q('select private.finalize_receipt($1)',[sent.id]),'anon'),/permission denied/);
 });
 await t.test('an offline lineup keeps the same player identity after an administrator renames the player',async()=>{
  const registry=await rpc('get_group_registry',[group.id]);const player=registry.players.find(p=>p.id===players[0].id);
  await rpc('save_group_player',[group.id,player.id,'Person One Renamed','fixed',player.version]);
  const source=raw();await receive(source);
  const current=await load(source.id);assert.ok(current.payload.sets[0].rosters.A.some(p=>p.id===player.id&&p.name==='Person 1'));
  const refreshed=await rpc('get_group_registry',[group.id]);assert.equal(refreshed.players.length,registry.players.length);assert.ok(!refreshed.players.some(p=>p.name==='Person 1'));
 });
 await t.test('legacy administrator uploads also finish immediately and keep their retry contract',async()=>{
  const source=structuredClone((await load(before.id)).payload);source.id=randomUUID();source.sets=[{team_a_name:'Home',team_b_name:'Away',score_a:1,score_b:0,rosters:{A:players.slice(0,6),B:players.slice(6)},points:[{team:'A',player_id:players[0].id,player_name:players[0].name,is_opponent_error:false}]}];
  const result=await rpc('submit_match',[source]);assert.equal(result.status,'saved');assert.equal(result.published,true);
  assert.deepEqual(result.submission,source);assert.equal((await rpc('submit_match',[source])).status,'already_saved');
 });
 await t.test('delete updates results immediately and retries or day closure cannot resurrect the match',async()=>{
  const current=await load(sent.id);const count=(await summary()).match_count;
  await assert.rejects(rpc('delete_final_match',[group.id,sent.id,current.version-1,'Stale']),/changed/);
  await rpc('delete_final_match',[group.id,sent.id,current.version,'Unwanted match']);await rpc('delete_final_match',[group.id,sent.id,current.version,'Unwanted match']);
  assert.equal((await summary()).match_count,count-1);assert.equal((await list('')).total,count-1);
  const retry=await receive(sent);assert.equal(retry.deleted,true);assert.equal(retry.published,false);assert.equal((await summary()).match_count,count-1);
  await assert.rejects(load(sent.id),/not found/);
  const d=await rpc('get_game_day',[day.day.id]);await rpc('change_game_day',[day.day.id,d.day.version,'reopen',null,'Reopen']);
  const reopened=await rpc('get_game_day',[day.day.id]);await rpc('change_game_day',[day.day.id,reopened.day.version,'close',null,'Close']);
  assert.equal((await summary()).match_count,count-1);
  assert.ok((await q('select submission from private.day_receipts where id=$1',[sent.id])).rows[0].submission);
 });
});
