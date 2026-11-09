import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, enableCourtMode, matchReducer, restoreMatch } from '../src/game/match.js';
import { applyDayLineup, receivedMatchPayload } from '../src/game/gameDay.js';
import { reconcileSubmission } from '../src/public/reconciliation.js';

test('game-day receipts, private reviews, atomic publication and legacy migration', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  const files = (await readdir(new URL('./migrations/', import.meta.url))).filter(f => f.endsWith('.sql') && f <= '20261107000100_game_days_and_private_review.sql').sort();
  for (const file of files.slice(0,-1)) await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
  const q = (sql,args=[]) => db.query(sql,args);
  const owner = randomUUID(), other = randomUUID();
  for (const id of [owner,other]) await q('insert into auth.users values($1,$2,now())',[id,`${id}@test.local`]);
  async function role(user, action, name='authenticated') {
    await db.exec(`begin; set local role ${name};`);
    try { await q("select set_config('request.jwt.claim.sub',$1,true)",[user ?? '']); const result=await action(); await db.exec('commit'); return result; }
    catch(error) { await db.exec('rollback'); throw error; }
  }
  const rpc = async (name, args=[], actor=owner, access='authenticated') => (await role(actor,()=>q(name,args),access)).rows[0]?.data;
  const group = (await role(owner,()=>q("select * from public.create_group('Court','America/Toronto')"))).rows[0];
  const foreign = (await role(other,()=>q("select * from public.create_group('Other','UTC')"))).rows[0];
  const players = Array.from({length:14},(_,i)=>({ id:randomUUID(),name:`Player ${i+1}` }));
  for (const person of players) await rpc('select public.sync_group_player($1,$2,$3) as data',[group.id,person.id,person.name]);
  const lineup = { A:{ name:'Home',players:players.slice(0,6) }, B:{ name:'Away',players:players.slice(6,12) } };
  const legacy = { format_version:1,id:randomUUID(),group_id:group.id,started_at:'2026-11-06T23:00:00Z',closed_at:'2026-11-07T01:00:00Z',team_a_name:'Home',team_b_name:'Away',sets:[{team_a_name:'Home',team_b_name:'Away',score_a:1,score_b:0,rosters:{A:players.slice(0,6),B:players.slice(6,12)},points:[{team:'A',player_id:players[0].id,player_name:players[0].name,is_opponent_error:false}]}] };
  await rpc('select public.submit_match($1) as data',[legacy]);
  await db.exec(await readFile(new URL(`./migrations/${files.at(-1)}`,import.meta.url),'utf8'));
  assert.deepEqual((await q('select snapshot from public.matches where id=$1',[legacy.id])).rows[0].snapshot,legacy);
  const seeded = (await q('select * from private.day_receipts where id=$1',[legacy.id])).rows[0]; assert.equal(seeded.decision,'approved');
  const created = await rpc('select public.create_game_day($1,$2,$3) as data',[group.id,'2026-11-07',lineup]);
  let code=created.code, dayId=created.day.id;
  const load = () => rpc('select public.get_game_day($1) as data',[dayId]);
  const redeem = (value=code) => rpc('select public.redeem_day_code($1) as data',[value],null,'anon');
  const receive = body => rpc('select public.receive_day_match($1,$2) as data',[code,body],null,'anon');
  const review = (body, id=body.id, version=1, decision='approved', actor=owner) => rpc('select public.review_day_match($1,$2,$3,$4,$5) as data',[id,version,decision,body,'Review participants'],actor);
  async function change(action, note='Review day', nextLineup=null) {
    const context=await load(); return rpc('select public.change_game_day($1,$2,$3,$4,$5) as data',[dayId,context.day.version,action,nextLineup,note]);
  }
  let state=applyDayLineup(enableCourtMode(createMatch()),{...await redeem(),code});
  state=matchReducer(state,{type:'point',team:'A',playerId:'p1',startedAt:'2026-11-07T23:00:00.000Z'});
  const changed=structuredClone(state.teams); changed.A.players[0].name='Substitute';
  state=matchReducer(state,{type:'edit',teams:changed});
  state=matchReducer(state,{type:'point',team:'A',playerId:'p1'});
  state=matchReducer(state,{type:'closeSet'});
  state=restoreMatch(JSON.stringify(state));
  const raw=receivedMatchPayload({id:randomUUID(),formatVersion:1,closedAt:'2026-11-08T01:00:00.000Z',state});
  const mapping=Object.fromEntries(raw.sets.flatMap(s=>s.segments.flatMap(seg=>['A','B'].flatMap(team=>seg.rosters[team].map(p=>[p.key,p.name==='Substitute'?players[12].id:players.find(known=>known.name===p.name).id])))));
  const draft=reconcileSubmission(raw,mapping,players);

  await t.test('code grants only a lineup and receipt creation, no direct or administrative access',async()=>{
    assert.equal(code.length,64); assert.deepEqual((await redeem()).lineup,lineup);
    await assert.rejects(redeem('wrong'),/invalid or revoked/);
    await assert.rejects(rpc('select public.get_game_day($1) as data',[dayId],null,'anon'),/permission denied/);
    await assert.rejects(rpc('select public.get_game_day($1) as data',[dayId],other),/Only group administrators/);
    for (const table of ['game_days','day_lineups','day_receipts','day_audit']) await assert.rejects(role(owner,()=>q(`select * from private.${table}`)),/permission denied/);
    const wrong=structuredClone(lineup); wrong.B.players[0]=wrong.A.players[0];
    await assert.rejects(rpc('select public.create_game_day($1,$2,$3) as data',[group.id,'2026-11-09',wrong]),/twelve different/);
    await assert.rejects(rpc('select public.create_game_day($1,$2,$3) as data',[foreign.id,'2026-11-09',lineup]),/Only group administrators/);
  });
  await t.test('raw names and segments survive; retries acknowledge durable immutable receipt without publication',async()=>{
    assert.equal(raw.sets[0].segments.length,2); assert.equal(draft.sets[0].rosters.A.length,7);
    assert.equal(draft.sets[0].points[0].player_id,players[0].id); assert.equal(draft.sets[0].points[1].player_id,players[12].id);
    assert.equal((await receive(raw)).status,'received'); assert.equal((await receive(raw)).status,'already_received');
    assert.equal((await q('select count(*)::int n from public.matches where id=$1',[raw.id])).rows[0].n,0);
    const conflicting=structuredClone(raw); conflicting.team_a_name='Other'; await assert.rejects(receive(conflicting),/different submission/);
    const bad=structuredClone(raw); bad.id=randomUUID(); bad.sets[0].segments[0].from_point=1; await assert.rejects(receive(bad),/segment boundary/);
    const wrong=structuredClone(raw); wrong.id=randomUUID(); wrong.group_id=foreign.id; await assert.rejects(receive(wrong),/another game day/);
    const publicData=await rpc('select public.public_group_summary($1,2026,1) as data',[group.id],null,'anon'); assert.equal(publicData.match_count,1);
    assert.equal(JSON.stringify(publicData).includes('Substitute'),false);
  });
  let reviewId;
  await t.test('reviews are private, validated, versioned and included only at atomic day closure',async()=>{
    await assert.rejects(change('close'),/Review all received/);
    await assert.rejects(review(draft,raw.id,1,'approved',other),/Only group administrators/);
    const bad=structuredClone(draft); bad.sets[0].points[0].player_id=randomUUID(); await assert.rejects(review(bad),/foreign key/);
    assert.equal((await q('select count(*)::int n from public.matches where id=$1',[raw.id])).rows[0].n,0);
    reviewId=randomUUID();
    const reviewArgs=[raw.id,1,'approved',draft,'Review participants',reviewId];
    await rpc('select public.review_day_match($1,$2,$3,$4,$5,$6) as data',reviewArgs);
    assert.equal((await rpc('select public.review_day_match($1,$2,$3,$4,$5,$6) as data',reviewArgs)).status,'already_reviewed');
    await assert.rejects(rpc('select public.review_day_match($1,$2,$3,$4,$5,$6) as data',[...reviewArgs.slice(0,4),'Different reason',reviewId]),/different change/);
    await assert.rejects(review(draft),error=>error.code==='40001');
    const receipt=(await load()).receipts[0]; assert.equal(receipt.audit.length,1); assert.deepEqual(receipt.submission,raw);
    assert.equal((await q('select count(*)::int n from public.matches where id=$1',[raw.id])).rows[0].n,0);
    const extra={...raw,id:randomUUID()}; const extraDraft={...draft,id:extra.id};
    await receive(extra); await review(extraDraft);
    const corrupt=structuredClone(extraDraft); corrupt.sets[0].score_a=999;
    await q('update private.day_receipts set draft=$1 where id=$2',[corrupt,extra.id]);
    await assert.rejects(change('close'),/Scores|scores/);
    assert.equal((await q('select count(*)::int n from public.matches where id in ($1,$2)',[raw.id,extra.id])).rows[0].n,0);
    await review(null,extra.id,2,'excluded');
    await change('close');
    assert.deepEqual((await q('select snapshot from public.matches where id=$1',[raw.id])).rows[0].snapshot,draft);
    const summary=await rpc('select public.public_group_summary($1,2026,1) as data',[group.id],null,'anon');
    assert.equal(summary.match_count,2); assert.equal(summary.players.find(p=>p.id===players[12].id).points,1);
    assert.equal(summary.players.find(p=>p.id===players[1].id).matches,2);
    assert.equal((await receive(raw)).status,'already_received');
  });
  await t.test('late uploads remain private and survive code rotation, reopening and republication',async()=>{
    const late={...raw,id:randomUUID()}; await receive(late);
    await assert.rejects(review({...draft,id:late.id},late.id),/Reopen/);
    assert.equal((await load()).day.state,'closed');
    await change('reopen'); await review({...draft,id:late.id},late.id);
    const correction=structuredClone(draft); correction.sets[0].points[0].player_id=players[1].id; correction.sets[0].points[0].player_name=players[1].name;
    await review(correction,raw.id,2);
    assert.deepEqual((await q('select snapshot from public.matches where id=$1',[raw.id])).rows[0].snapshot,draft);
    await change('close'); assert.deepEqual((await q('select snapshot from public.matches where id=$1',[raw.id])).rows[0].snapshot,correction);
    const oldCode=code; const rotated=await change('rotate_code'); code=rotated.code;
    await assert.rejects(redeem(oldCode),/invalid or revoked/); assert.equal((await redeem()).day_id,dayId);
    assert.equal((await receive(raw)).status,'already_received');
    await change('revoke_code'); await assert.rejects(redeem(),/invalid or revoked/);
  });
  await t.test('disregarding a published result hides all public rows while preserving receipts and revisions',async()=>{
    await change('reopen'); await review(null,raw.id,3,'excluded'); await change('close');
    for(const table of ['matches','match_sets','set_players','match_points']) {
      const key=table==='matches'?'id':'match_id';
      assert.equal((await role(null,()=>q(`select count(*)::int n from public.${table} where ${key}=$1`,[raw.id]),'anon')).rows[0].n,0);
    }
    assert.equal((await q('select count(*)::int n from private.day_receipts where id=$1',[raw.id])).rows[0].n,1);
    assert.equal((await q('select count(*)::int n from private.match_revisions where match_id=$1',[raw.id])).rows[0].n,1);
    assert.equal((await q('select published from public.matches where id=$1',[raw.id])).rows[0].published,false);
    assert.equal((await rpc('select public.review_day_match($1,$2,$3,$4,$5,$6) as data',[raw.id,1,'approved',draft,'Review participants',reviewId])).status,'already_reviewed');
  });
  await t.test('older clients enter private inbox, and existing published match corrections are staged',async()=>{
    const older={...legacy,id:randomUUID()}; assert.equal((await rpc('select public.submit_match($1) as data',[older])).status,'saved');
    assert.equal((await q('select count(*)::int n from public.matches where id=$1',[older.id])).rows[0].n,0);
    assert.equal((await rpc('select public.submit_match($1) as data',[older])).status,'already_saved');
    assert.equal((await rpc('select public.submit_match($1) as data',[legacy])).status,'already_saved');
    const legacyDay=(await q('select day_id from private.day_receipts where id=$1',[legacy.id])).rows[0].day_id;
    const day=(await rpc('select public.get_game_day($1) as data',[legacyDay])).day;
    await rpc('select public.change_game_day($1,$2,$3,$4,$5) as data',[legacyDay,day.version,'reopen',null,'Review legacy results']);
    const next=structuredClone(legacy); next.sets[0].points[0].player_id=players[1].id; next.sets[0].points[0].player_name=players[1].name;
    await rpc('select public.correct_match($1,$2,1,$3,$4,$5) as data',[group.id,legacy.id,next,'Correct legacy author',randomUUID()]);
    assert.deepEqual((await q('select snapshot from public.matches where id=$1',[legacy.id])).rows[0].snapshot,legacy);
    assert.deepEqual((await rpc('select public.get_match_for_edit($1,$2) as data',[group.id,legacy.id])).payload,next);
    let oldDay=(await rpc('select public.get_game_day($1) as data',[legacyDay])).day;
    await rpc('select public.change_game_day($1,$2,$3,$4,$5) as data',[legacyDay,oldDay.version,'lineup',lineup,'Prepare codes for legacy archives']);
    oldDay=(await rpc('select public.get_game_day($1) as data',[legacyDay])).day;
    const access=await rpc('select public.change_game_day($1,$2,$3,$4,$5) as data',[legacyDay,oldDay.version,'rotate_code',null,'Enable legacy archive recovery']);
    const ack=await rpc('select public.receive_day_match($1,$2) as data',[access.code,legacy],null,'anon');
    assert.equal(ack.status,'already_received'); assert.deepEqual(ack.submission,legacy);
    const provisional=structuredClone(legacy); provisional.id=randomUUID();
    const provisionalId=randomUUID(); provisional.sets[0].rosters.A[0]={id:provisionalId,name:'Not registered yet'};
    provisional.sets[0].points[0]={team:'A',player_id:provisionalId,player_name:'Not registered yet',is_opponent_error:false};
    assert.equal((await rpc('select public.receive_day_match($1,$2) as data',[access.code,provisional],null,'anon')).status,'received');
    assert.equal((await q('select count(*)::int n from public.matches where id=$1',[provisional.id])).rows[0].n,0);
    assert.equal((await q('select count(*)::int n from public.players where id=$1',[provisionalId])).rows[0].n,0);

  });
});
