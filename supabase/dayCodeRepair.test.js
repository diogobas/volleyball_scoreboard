import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, enableCourtMode, matchReducer } from '../src/game/match.js';
import { applyDayLineup, receivedMatchPayload } from '../src/game/gameDay.js';

test('standalone code repair fixes original creation/rotation without intermediate migrations or data loss', async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  const files=(await readdir(new URL('./migrations/',import.meta.url))).filter(file=>file.endsWith('.sql') && file<='20261107000100_game_days_and_private_review.sql').sort();
  for(const file of files) await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
  const q=(sql,args=[])=>db.query(sql,args);
  const owner=randomUUID(); await q('insert into auth.users values($1,$2,now())',[owner,'owner@example.test']);
  async function as(user,action,role='authenticated') {
    await db.exec(`begin; set local role ${role};`);
    try { await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']); const result=await action(); await db.exec('commit'); return result; }
    catch(error) { await db.exec('rollback'); throw error; }
  }
  const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args),role).then(result=>result.rows[0].data);
  const group=(await as(owner,()=>q("select * from public.create_group('Tuesday','America/Toronto')"))).rows[0];
  const players=Array.from({length:12},(_,i)=>({id:randomUUID(),name:`Player ${i+1}`}));
  for(const person of players) await rpc('sync_group_player',[group.id,person.id,person.name]);
  const lineup={A:{name:'Team 1',players:players.slice(0,6)},B:{name:'Team 2',players:players.slice(6)}};
  const old=await rpc('create_game_day',[group.id,'2026-11-08',lineup]);
  assert.equal(old.code.length,64);
  // Reproduce applying only the last helper migration while the original RPC remains installed.
  await db.exec(await readFile(new URL('./migrations/20261108000400_five_character_day_codes.sql',import.meta.url),'utf8'));
  const stillLong=await rpc('create_game_day',[group.id,'2026-11-09',lineup]);
  assert.equal(stillLong.code.length,64);
  // The repair must also create its helpers when neither earlier helper exists.
  await db.exec('drop function private.new_day_code(); drop function private.normalize_day_code(text);');
  const repair=await readFile(new URL('./migrations/20261108000500_repair_day_code_generation.sql',import.meta.url),'utf8');
  await db.exec(repair); await db.exec(repair);
  const redeem=code=>rpc('redeem_day_code',[code],null,'anon');
  assert.equal((await redeem(old.code)).day_id,old.day.id);
  assert.equal((await redeem(stillLong.code)).day_id,stillLong.day.id);
  const created=await rpc('create_game_day',[group.id,'2026-11-10',lineup]);
  assert.match(created.code,/^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal((await redeem(` ${created.code.toLowerCase()} `)).day_id,created.day.id);
  const rotated=await rpc('change_game_day',[old.day.id,1,'rotate_code',null,'Use a short code']);
  assert.match(rotated.code,/^[A-HJ-NP-Z2-9]{5}$/);
  await assert.rejects(redeem(old.code),/invalid or revoked/);
  const context={...await redeem(rotated.code),code:rotated.code};
  let state=applyDayLineup(enableCourtMode(createMatch()),context);
  state=matchReducer(state,{type:'point',team:'A',playerId:'p1',startedAt:'2026-11-08T23:00:00Z'});
  state=matchReducer(state,{type:'closeSet'});
  const payload=receivedMatchPayload({id:randomUUID(),formatVersion:1,closedAt:'2026-11-09T01:00:00Z',state});
  assert.equal((await rpc('receive_day_match',[rotated.code.toLowerCase(),payload],null,'anon')).status,'received');
  assert.equal((await rpc('receive_day_match',[rotated.code,payload],null,'anon')).status,'already_received');
  const day=await rpc('get_game_day',[old.day.id]);
  assert.deepEqual(day.lineup,lineup); assert.equal(day.receipts.length,1);
  await rpc('change_game_day',[old.day.id,day.day.version,'revoke_code',null,'Revoke']);
  await assert.rejects(redeem(rotated.code),/invalid or revoked/);
  assert.equal((await rpc('list_game_days',[group.id])).length,3);
  assert.equal((await rpc('get_group_registry',[group.id])).players.length,12);
  await assert.rejects(rpc('create_game_day',[group.id,'2026-11-11',lineup],null,'anon'),/permission denied/);
});
