import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { editPoint, removeEmptySet, removePoint, replaceParticipant, splitSet } from '../src/public/corrections.js';

test('administrative corrections are atomic, versioned, audited and isolated from immutable uploads', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  for (const file of ['20261106000100_groups_and_match_schema.sql','20261106000200_player_registry_sync.sql','20261106000300_atomic_match_submission.sql','20261106000400_public_statistics.sql','20261106000500_administrative_corrections.sql']) {
    await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
  }
  const query = (sql,args=[]) => db.query(sql,args);
  const [owner,other] = [randomUUID(),randomUUID()];
  for (const id of [owner,other]) await query('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`]);
  async function role(user, action, name='authenticated') {
    await db.exec(`begin; set local role ${name};`);
    try { await query("select set_config('request.jwt.claim.sub',$1,true)",[user ?? '']); const result=await action(); await db.exec('commit'); return result; }
    catch(error) { await db.exec('rollback'); throw error; }
  }
  const rpc = async (user,sql,args=[],name='authenticated') => (await role(user,()=>query(sql,args),name)).rows[0]?.data;
  const group = (await role(owner,()=>query("select * from public.create_group('Volleyball','America/Toronto')"))).rows[0];
  const foreign = (await role(other,()=>query("select * from public.create_group('Other','UTC')"))).rows[0];
  const players=Array.from({length:13},(_,i)=>({id:randomUUID(),name:`Person ${i}`}));
  for(const person of players) await role(owner,()=>query('select public.sync_group_player($1,$2,$3)',[group.id,person.id,person.name]));
  const foreignId=randomUUID(); await role(other,()=>query("select public.sync_group_player($1,$2,'Foreign')",[foreign.id,foreignId]));
  const original={format_version:1,id:randomUUID(),group_id:group.id,started_at:'2026-11-06T23:00:00.000Z',closed_at:'2026-11-07T01:00:00.000Z',team_a_name:'Home',team_b_name:'Away',
    sets:[{team_a_name:'Home',team_b_name:'Away',score_a:1,score_b:1,rosters:{A:players.slice(0,6),B:players.slice(6,12)},points:[
      {team:'A',player_id:players[0].id,player_name:players[0].name,is_opponent_error:false},
      {team:'B',player_id:null,player_name:null,is_opponent_error:true},
    ]},{team_a_name:'Home',team_b_name:'Away',score_a:1,score_b:0,rosters:{A:players.slice(0,6),B:players.slice(6,12)},points:[
      {team:'A',player_id:players[1].id,player_name:players[1].name,is_opponent_error:false},
    ]}]};
  const submit=body=>rpc(owner,'select public.submit_match($1) as data',[body]); await submit(original);
  const load=(user=owner,target=group.id)=>rpc(user,'select public.get_match_for_edit($1,$2) as data',[target,original.id]);
  const history=(user=owner,page=1,target=group.id)=>rpc(user,'select public.match_revision_history($1,$2,$3) as data',[target,original.id,page]);
  const correction=(body,version,revisionId=randomUUID(),reason='Review recorded match',user=owner)=>rpc(user,'select public.correct_match($1,$2,$3,$4,$5,$6) as data',[group.id,original.id,version,body,reason,revisionId]);
  const publicSummary=()=>rpc(null,'select public.public_group_summary($1,2026,1) as data',[group.id],'anon');
  const publicDetails=()=>rpc(null,'select public.public_match_details($1,$2) as data',[group.id,original.id],'anon');
  let corrected=replaceParticipant(original,0,'A',0,players[12]);
  corrected=editPoint(corrected,0,1,{team:'A'});
  corrected=removeEmptySet(removePoint(corrected,1,0),1);
  corrected=splitSet(corrected,0,1);
  const revisionId=randomUUID();

  await t.test('only administrators load editable payloads and group-scoped registrations',async()=>{
    const data=await load(); assert.deepEqual(data.payload,original); assert.equal(data.version,1); assert.equal(data.players.length,13);
    assert.ok(data.players.every(p=>p.id!==foreignId));
    await assert.rejects(load(other),/Only group administrators/);
    await assert.rejects(rpc(null,'select public.get_match_for_edit($1,$2) as data',[group.id,original.id],'anon'),/permission denied/);
    await assert.rejects(load(other,foreign.id),/not found in this group/);
  });

  await t.test('participants, authors, points and closures rebuild in one revision and update public totals',async()=>{
    const result=await correction(corrected,1,revisionId,' Fix participants and set boundaries ');
    assert.equal(result.version,2); assert.equal(result.status,'corrected');
    const current=await load(); assert.deepEqual(current.payload,corrected); assert.equal(current.version,2);
    const audit=await history(); assert.equal(audit.total,1);
    assert.equal(audit.revisions[0].author_id,owner); assert.equal(audit.revisions[0].author_email,`${owner}@example.test`);
    assert.equal(audit.revisions[0].reason,'Fix participants and set boundaries'); assert.ok(audit.revisions[0].created_at);
    assert.deepEqual(audit.revisions[0].previous_snapshot,original); assert.deepEqual(audit.revisions[0].new_snapshot,corrected);
    const metadata=(await query('select * from private.match_metadata where match_id=$1',[original.id])).rows[0];
    assert.deepEqual(metadata.submission,original); assert.equal(metadata.submitted_by,owner);
    const summary=await publicSummary(); assert.equal(summary.match_count,1); assert.equal(summary.point_count,2);
    assert.equal(summary.players.find(p=>p.id===players[12].id).points,1);
    assert.equal(summary.players.find(p=>p.id===players[0].id).matches,0);
    const details=await publicDetails(); assert.equal(details.sets_a,2); assert.equal(details.sets.length,2);
    assert.equal(details.sets[1].errors_a,1); assert.equal(details.sets[0].players.find(p=>p.id===players[12].id).points,1);
  });

  await t.test('same revision retries are idempotent, stale sessions conflict and original upload retries preserve later corrections',async()=>{
    assert.equal((await correction(corrected,1,revisionId,'Fix participants and set boundaries')).status,'already_corrected');
    assert.equal((await history()).total,1);
    const next=editPoint(corrected,1,0,{team:'B',scorer:players[6].id});
    await assert.rejects(correction(next,1),error=>error.code==='40001');
    assert.deepEqual((await load()).payload,corrected);
    await role(owner,()=>query('select public.grant_group_admin($1,$2)',[group.id,`${other}@example.test`]));
    await assert.rejects(correction(corrected,1,revisionId,'Fix participants and set boundaries',other),/different correction/);
    assert.equal((await correction(next,2,randomUUID(),'Correct point team and author',other)).version,3);
    const ack=await correction(corrected,1,revisionId,'Fix participants and set boundaries');
    assert.equal(ack.version,2); assert.equal(ack.current_version,3);
    assert.deepEqual((await load()).payload,next);
    const retry=await submit(original); assert.equal(retry.status,'already_saved'); assert.equal(retry.version,3); assert.deepEqual(retry.submission,original);
    assert.deepEqual((await load()).payload,next);
    await assert.rejects(submit(next),/different submission/);
    const publicData=await publicSummary(); assert.ok(publicData.players.every(p=>p.wins===0));
    assert.equal((await publicDetails()).sets_b,1);
  });

  await t.test('invalid corrections roll back all rows and leave versions and audit untouched',async()=>{
    const baseline=await load(); const audit=await history();
    async function rows() {
      return Promise.all(['select * from public.match_sets order by set_number','select * from public.set_players order by set_number,team,position','select * from public.match_points order by sequence'].map(sql=>query(sql).then(result=>result.rows)));
    }
    const before=await rows();
    for(const mutate of [
      body=>{body.sets=[];},body=>{body.sets[1].points[0].player_id=randomUUID();},
      body=>{body.sets[0].rosters.A[0]=body.sets[0].rosters.B[0];},body=>{body.sets[0].rosters.A[0]={id:foreignId,name:'Foreign'};},
      body=>{body.sets[0].score_a=99;},body=>{body.sets[0].points[0].is_opponent_error=true;},
      body=>{body.group_id=foreign.id;},body=>{body.id=randomUUID();},body=>{body.closed_at='2026-11-08T01:00:00Z';},
      body=>{body.team_a_name='Another';},body=>{body.private_reason='Never public';},
    ]) {
      const body=structuredClone(baseline.payload); mutate(body);
      await assert.rejects(correction(body,baseline.version));
      assert.deepEqual(await load(),baseline); assert.deepEqual(await rows(),before); assert.deepEqual(await history(),audit);
    }
    const body=editPoint(baseline.payload,0,0,{scorer:players[1].id});
    await assert.rejects(correction(body,3,randomUUID(),'   '),/reason/);
    await assert.rejects(correction(body,3,randomUUID(),'\n\t\r  '),/reason/);
    await assert.rejects(correction(body,3,randomUUID(),'x'.repeat(501)),/reason/);
    await assert.rejects(correction(baseline.payload,3),/No match changes/);
    assert.deepEqual(await rows(),before);
  });

  await t.test('revoked access and anonymous/direct calls cannot alter or read private revisions',async()=>{
    await role(owner,()=>query('select public.revoke_group_admin($1,$2)',[group.id,other]));
    const body=editPoint((await load()).payload,0,0,{scorer:players[1].id});
    await assert.rejects(correction(body,3,randomUUID(),'Unauthorized',other),/Only group administrators/);
    await assert.rejects(history(other),/Only group administrators/);
    await assert.rejects(rpc(null,'select public.correct_match($1,$2,3,$3,$4,$5) as data',[group.id,original.id,body,'No',randomUUID()],'anon'),/permission denied/);
    for(const table of ['private.match_revisions','private.match_metadata']) await assert.rejects(role(owner,()=>query(`select * from ${table}`)),/permission denied/);
    await assert.rejects(role(owner,()=>query('select private.write_match_contents($1)',[body])),/permission denied/);
    await assert.rejects(role(owner,()=>query('delete from public.matches where id=$1',[original.id])),/permission denied/);
    const visible=JSON.stringify({summary:await publicSummary(),details:await publicDetails()});
    for(const secret of [owner,other,'@example.test','Fix participants','Correct point team','previous_snapshot','author_id']) assert.equal(visible.includes(secret),false);
    assert.equal((await load()).version,3);
  });

  await t.test('private history paginates complete before/after values without exposing it publicly',async()=>{
    let context=await load();
    for(let i=0;i<21;i++) {
      const body=editPoint(context.payload,0,0,{scorer:players[i%2+1].id});
      await correction(body,context.version,randomUUID(),`Review ${i+1}`); context=await load();
    }
    const first=await history(); const second=await history(owner,2);
    assert.equal(first.total,23); assert.equal(first.revisions.length,20); assert.equal(second.revisions.length,3);
    assert.equal(new Set([...first.revisions,...second.revisions].map(r=>r.id)).size,23);
    assert.equal(first.revisions[0].version,24); assert.equal(second.revisions.at(-1).version,2);
    assert.ok(first.revisions.every(r=>r.previous_snapshot.sets.length && r.new_snapshot.sets.length));
    await assert.rejects(history(owner,0),/Invalid history page/);
  });
});
