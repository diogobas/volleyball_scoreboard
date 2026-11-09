import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const target='653c2c8d-9903-4410-b109-c66320f7300c';
const matchId='8deb93c2-b213-4a36-9026-e56117c03113';
// This tests the pre-community repair script, which must run before scoped access rollout.
test('repairing the deployed score-only import restores references and every scorer without duplicating identities',async t=>{
 const db=new PGlite();t.after(()=>db.close());const q=(sql,args=[])=>db.query(sql,args);
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(f=>f.endsWith('.sql') && f<'20261109000200_communities_and_scoped_public_access.sql').sort())await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
 const owner=randomUUID();await q('insert into auth.users values($1,$2,now())',[owner,'owner@test.local']);
 await q("insert into public.groups(id,name,time_zone) values($1,'Tuesday Volleyball ‐ 7:30PM-10PM','America/Toronto')",[target]);
 await q('insert into private.group_admins(group_id,user_id,added_by) values($1,$2,$2)',[target,owner]);
 const names=['Anderson','Carlos','Chicó','Diogo','Diego','Geraldo','Jota','KJ','Gaëtan','Phillip','Omer','Kaue','Dimitri','Felipe C.','João Paulo'];
 for(const name of names)await q("insert into public.players(group_id,name,category) values($1,$2,$3)",[target,name,['Felipe C.','João Paulo'].includes(name)?'sub':'fixed']);
 // Tombstones with the same names must not be selected or resurrected.
 for(const name of ['Anderson','Chicó','Carlos'])await q("insert into public.players(group_id,name,deleted_at) values($1,$2,now())",[target,name]);
 const initial=await q('select id,name,category,deleted_at from public.players order by id');
 const importSql=await readFile(new URL('./maintenance/import-tuesday-2026-11-03.sql',import.meta.url),'utf8');await db.exec(importSql);
 const repair=await readFile(new URL('./maintenance/repair-tuesday-2026-11-03.sql',import.meta.url),'utf8');
 async function as(user,action,role='authenticated'){await db.exec(`begin;set local role ${role};`);try{await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);const result=await action();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
 const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args),role).then(r=>r.rows[0].data);
 const summary=()=>rpc('public_group_summary',[target,2026,1],null,'anon');
 await t.test('the exact missing-column state is repaired and all scores, totals and winner assignments balance',async()=>{
  await db.exec('alter table public.groups drop column display_id;alter table public.groups drop column display_number;alter table public.players drop column display_id;alter table public.players drop column display_number;');
  await assert.rejects(summary(),/display_id/);
  await db.exec(repair);
  const groups=await as(null,()=>q('select id,display_id from public.groups'),'anon');assert.match(groups.rows[0].display_id,/^G-\d+$/);
  assert.deepEqual((await q('select id,name,category,deleted_at from public.players order by id')).rows,initial.rows);
  const data=await summary();assert.equal(data.match_count,1);assert.equal(data.point_count,243);assert.equal(data.participant_count,12);assert.equal(data.unattributed_matches,0);
  const expected={'Anderson':19,'Diogo':19,'Omer':19,'Phillip':16,'Gaëtan':15,'Felipe C.':15,'João Paulo':13,'Chicó':12,'Dimitri':10,'Kaue':8,'Jota':6,'Carlos':0};
  for(const [name,points]of Object.entries(expected)){const p=data.players.find(p=>p.name===name&&!p.removed);assert.equal(p.points,points,name);assert.equal(p.matches,1,name);assert.equal(p.days,1,name);assert.equal(p.wins,['Anderson','Diogo','Phillip','Gaëtan','Jota','Chicó'].includes(name)?1:0,name);}
  const detail=await rpc('public_match_details',[target,matchId],null,'anon');assert.equal(detail.player_totals_recorded,true);assert.equal(detail.errors_a,50);assert.equal(detail.errors_b,41);assert.equal(detail.winner,'B');assert.equal(detail.decided_at,3);assert.equal(detail.sets.length,6);assert.equal(detail.players.length,14);
  assert.deepEqual(detail.players.filter(p=>p.name==='Chicó').map(p=>[p.team,p.points,p.result_team]),[['A',7,'B'],['B',5,'B']]);
  assert.equal((await q('select count(*)::int n from public.match_points')).rows[0].n,0);
  const before=(await q('select submission from private.match_metadata where match_id=$1',[matchId])).rows[0].submission;assert.equal(before.player_totals_recorded,false);
  const audit=(await q('select * from private.maintenance_corrections where match_id=$1',[matchId])).rows[0];assert.equal(audit.previous_snapshot.player_totals_recorded,false);assert.equal(audit.new_snapshot.screenshot_source.confirmed_aliases,true);
  await assert.rejects(as(null,()=>q('select * from private.maintenance_corrections'),'anon'),/permission denied/);
 });
 await t.test('repeat repairs preserve IDs, references, versions and later administrative edits',async()=>{
  const refs=await q('select id,display_id from public.players order by id');const current=await rpc('get_historical_match',[target,matchId]);
  await db.exec(repair);assert.equal((await rpc('get_historical_match',[target,matchId])).version,current.version);assert.deepEqual((await q('select id,display_id from public.players order by id')).rows,refs.rows);
  const edited=structuredClone(current.payload);edited.players.find(p=>p.name==='Omer').points=20;edited.errors_a=49;
  const rev=randomUUID();const saved=await rpc('save_historical_match',[target,edited,current.version,'Adjust recorded total',rev]);
  assert.equal((await rpc('save_historical_match',[target,edited,current.version,'Adjust recorded total',rev])).version,saved.version);
  await db.exec(repair);assert.equal((await summary()).players.find(p=>p.name==='Omer'&&!p.removed).points,20);assert.equal((await rpc('get_historical_match',[target,matchId])).version,saved.version);
  assert.equal((await summary()).players.find(p=>p.name==='Chicó'&&!p.removed).wins,1);
 });
 await t.test('ambiguous competitive teams and duplicate rows within one team fail transactionally',async()=>{
  const current=await rpc('get_historical_match',[target,matchId]);const bad=structuredClone(current.payload);bad.players.find(p=>p.name==='Chicó'&&p.team==='A').result_team='A';
  await assert.rejects(rpc('save_historical_match',[target,bad,current.version,'Bad change',randomUUID()]),/same competitive team/);
  const duplicate=structuredClone(current.payload);duplicate.players.push(duplicate.players[0]);await assert.rejects(rpc('save_historical_match',[target,duplicate,current.version,'Bad duplicate',randomUUID()]),/same team/);
  assert.equal((await rpc('get_historical_match',[target,matchId])).version,current.version);
 });
 await t.test('a corrected import cannot be deleted by an administrator',async()=>{
  const current=await rpc('get_historical_match',[target,matchId]);
  await assert.rejects(rpc('delete_final_match',[target,matchId,current.version,'Delete']),/Finalized matches cannot be deleted/);
  assert.equal((await summary()).match_count,1);
 });
});
