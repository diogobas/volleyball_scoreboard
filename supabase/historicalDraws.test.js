import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('unfinished historical matches explicitly finish as draws, preserving scores and points without victories', async t => {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);const owner=randomUUID(),other=randomUUID();
 for(const id of [owner,other])await q('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`]);
 async function as(user,action,role='authenticated'){await db.exec(`begin;set local role ${role};`);try{await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);const r=await action();await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}
 const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select to_jsonb(public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})) as data`,args),role).then(r=>r.rows[0]?.data);
 const group=await rpc('create_group',['Draw test','America/Toronto']);
 const players=[];for(let i=0;i<12;i++)players.push(await rpc('save_group_player',[group.id,randomUUID(),`Person ${i}`,'fixed',null]));
 const body={format_version:3,id:randomUUID(),group_id:group.id,played_on:'2026-10-23',rules:'recreational',team_a_name:'Team 1',team_b_name:'Team 2',player_totals_recorded:true,ended_as_draw:true,
  sets:[[24,26],[25,20],[25,22],[22,21]].map(([score_a,score_b],i)=>({score_a,score_b,early_finish:i===3})),
  players:players.map((p,i)=>({team:i<6?'A':'B',player_id:p.id,name:p.name,points:i===0?15:i===6?24:0})),errors_a:81,errors_b:65};
 const revision=randomUUID();const save=(payload=body,version=null,token=revision,user=owner)=>rpc('save_historical_match',[group.id,payload,version,'Ended as draw',token],user);
 const summary=()=>rpc('public_group_period_summary',[group.id,2026,1,'fall'],null,'anon');
 await t.test('the photographed interrupted result saves and retries with all points intact',async()=>{
  const saved=await save();assert.equal((await save()).version,saved.version);
  const data=await summary();assert.equal(data.match_count,1);assert.equal(data.point_count,185);
  assert.equal(data.matches[0].ended_as_draw,true);assert.equal(data.matches[0].winner,null);assert.equal(data.matches[0].sets_a,2);assert.equal(data.matches[0].sets_b,1);
  assert.ok(data.players.every(p=>p.wins===0));assert.equal(data.players.find(p=>p.id===players[0].id).points,15);
  const details=await rpc('public_match_details',[group.id,body.id],null,'anon');assert.equal(details.ended_as_draw,true);assert.deepEqual(details.sets.map(s=>[s.score_a,s.score_b]),body.sets.map(s=>[s.score_a,s.score_b]));
  const list=await rpc('list_group_period_matches',[group.id,2026,null,'',1,5,'fall']);assert.equal(list.matches[0].ended_as_draw,true);
  assert.equal((await rpc('list_group_matches',[group.id,2026,null,'',1,5])).matches[0].ended_as_draw,true);
  const profile=await rpc('public_player_profile',[group.id,players[0].id,2026,'fall',1,5],null,'anon');assert.equal(profile.matches[0].player_result,'draw');assert.equal(profile.statistics.wins,0);assert.equal(profile.statistics.points,15);
 });
 await t.test('a tied interrupted last set is allowed only with an explicit draw and early finish',async()=>{
  const tied={...structuredClone(body),id:randomUUID(),player_totals_recorded:false,players:[],errors_a:null,errors_b:null};tied.sets[3].score_b=22;
  await save(tied,null,randomUUID());const detail=await rpc('public_match_details',[group.id,tied.id],null,'anon');assert.equal(detail.sets_a,2);assert.equal(detail.sets_b,1);assert.equal(detail.ended_as_draw,true);assert.equal(detail.sets[3].score_b,22);
  await assert.rejects(save({...tied,id:randomUUID(),ended_as_draw:false},null,randomUUID()),/tied set/);
  const unmarked=structuredClone(tied);unmarked.id=randomUUID();unmarked.sets[3].early_finish=false;
  await assert.rejects(save(unmarked,null,randomUUID()),/tied set/);
  const middle=structuredClone(tied);middle.id=randomUUID();middle.sets.push({score_a:1,score_b:2,early_finish:true});await assert.rejects(save(middle,null,randomUUID()),/tied set/);
  const official={...tied,id:randomUUID(),rules:'official'};await save(official,null,randomUUID());
 });
 await t.test('earned wins, totals, authorization and legacy unfinished matches retain their validations',async()=>{
  const won={...structuredClone(body),id:randomUUID(),sets:Array.from({length:3},()=>({score_a:25,score_b:20,early_finish:false}))};
  await assert.rejects(save(won,null,randomUUID()),/already won/);
  await assert.rejects(save({...body,id:randomUUID(),ended_as_draw:'yes'},null,randomUUID()),/Invalid draw option/);
  await assert.rejects(save({...body,id:randomUUID(),errors_a:0},null,randomUUID()),/must equal/);
  await assert.rejects(save({...body,id:randomUUID()},null,randomUUID(),other),/Only group administrators/);
  await assert.rejects(rpc('save_historical_match',[group.id,body,null,'Draw',randomUUID()],null,'anon'),/permission denied/);
  await assert.rejects(as(null,()=>q("select private.with_draw_results('{}'::jsonb)"),'anon'),/permission denied/);
  const legacy={...structuredClone(body),id:randomUUID()};delete legacy.ended_as_draw;await save(legacy,null,randomUUID());
  assert.equal((await rpc('public_match_details',[group.id,legacy.id],null,'anon')).ended_as_draw,false);
  const current=await rpc('get_historical_match',[group.id,body.id]);assert.equal(current.payload.ended_as_draw,true);
  const changed={...current.payload,team_a_name:'Renamed'};const token=randomUUID();const ack=await save(changed,current.version,token);assert.equal((await save(changed,current.version,token)).version,ack.version);
  await save();assert.equal((await rpc('public_match_details',[group.id,body.id],null,'anon')).team_a_name,'Renamed');
 });
});
