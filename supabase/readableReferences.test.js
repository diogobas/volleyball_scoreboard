import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMatch, enableCourtMode, matchReducer } from '../src/game/match';
import { applyDayLineup, receivedMatchPayload } from '../src/game/gameDay';

const migration = '20261108000200_readable_codes_and_references.sql';
test('readable references and short game-day codes preserve existing identities and capabilities', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  const files=(await readdir(new URL('./migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort();
  for(const file of files.filter(file=>file<migration)) await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
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
  const oldDay=await rpc('create_game_day',[group.id,'2026-11-08',lineup]);
  assert.equal(oldDay.code.length,64);
  await db.exec(await readFile(new URL(`./migrations/${migration}`,import.meta.url),'utf8'));
  const previousShortDay=await rpc('create_game_day',[group.id,'2026-11-07',lineup]);
  assert.equal(previousShortDay.code.length,14);
  await db.exec(await readFile(new URL('./migrations/20261108000300_shorter_day_codes.sql',import.meta.url),'utf8'));
  const eightCharacterDay=await rpc('create_game_day',[group.id,'2026-11-06',lineup]);
  assert.equal(eightCharacterDay.code.length,9);
  await db.exec(await readFile(new URL('./migrations/20261108000400_five_character_day_codes.sql',import.meta.url),'utf8'));
  const redeem=code=>rpc('redeem_day_code',[code],null,'anon');

  await t.test('existing UUIDs are unchanged; short public references are unique and discoverable',async()=>{
    const groups=(await as(owner,()=>q('select * from public.list_my_groups()'))).rows;
    assert.equal(groups[0].id,group.id); assert.match(groups[0].display_id,/^G-[1-9][0-9]*$/);
    const registry=await rpc('get_group_registry',[group.id]);
    assert.deepEqual(registry.players.map(player=>player.id).sort(),players.map(player=>player.id).sort());
    assert.ok(registry.players.every(player=>/^P-[1-9][0-9]*$/.test(player.display_id)));
    assert.equal(new Set(registry.players.map(player=>player.display_id)).size,12);
    const summary=await rpc('public_group_summary',[group.id,null,1],null,'anon');
    assert.equal(summary.group.display_id,groups[0].display_id);
    assert.ok(summary.players.every(player=>/^P-[1-9][0-9]*$/.test(player.display_id)));
    const newGroup=(await as(owner,()=>q("select * from public.create_group('Other','UTC')"))).rows[0];
    assert.notEqual(newGroup.display_id,groups[0].display_id);
    const newPlayer=await rpc('save_group_player',[newGroup.id,randomUUID(),'Other player','sub',null]);
    assert.ok(!registry.players.some(player=>player.display_id===newPlayer.display_id));
  });
  await t.test('old codes still work; new codes accept lowercase, no hyphens or whitespace',async()=>{
    assert.equal((await redeem(eightCharacterDay.code.toLowerCase().replaceAll('-',''))).day_id,eightCharacterDay.day.id);
    assert.equal((await redeem(previousShortDay.code.toLowerCase().replaceAll('-',''))).day_id,previousShortDay.day.id);
    assert.equal((await redeem(oldDay.code)).day_id,oldDay.day.id);
    assert.equal((await redeem(oldDay.code.toUpperCase())).day_id,oldDay.day.id);
    const day=await rpc('create_game_day',[group.id,'2026-11-09',lineup]);
    assert.match(day.code,/^[A-HJ-NP-Z2-9]{5}$/);
    for(const entered of [day.code,day.code.toLowerCase(),day.code.replaceAll('-',''),` ${day.code.replaceAll('-',' ')}\n`]) {
      assert.equal((await redeem(entered)).day_id,day.day.id);
    }
    const context={...await redeem(day.code),code:day.code};
    let state=applyDayLineup(enableCourtMode(createMatch()),context);
    state=matchReducer(state,{type:'point',team:'A',playerId:'p1',startedAt:'2026-11-09T23:00:00Z'});
    state=matchReducer(state,{type:'closeSet'});
    const payload=receivedMatchPayload({id:randomUUID(),formatVersion:1,closedAt:'2026-11-10T01:00:00Z',state});
    const short=day.code.replaceAll('-','').toLowerCase();
    assert.equal((await rpc('receive_day_match',[short,payload],null,'anon')).status,'received');
    assert.equal((await rpc('receive_day_match',[day.code,payload],null,'anon')).status,'already_received');
    const current=await rpc('get_game_day',[day.day.id]);
    const rotated=await rpc('change_game_day',[day.day.id,current.day.version,'rotate_code',null,'New code']);
    assert.match(rotated.code,/^[A-HJ-NP-Z2-9]{5}$/);
    assert.notEqual(rotated.code,day.code);
    await assert.rejects(redeem(day.code),/invalid or revoked/);
    assert.equal((await redeem(rotated.code)).day_id,day.day.id);
    await rpc('change_game_day',[day.day.id,rotated.day.version,'revoke_code',null,'Revoke code']);
    await assert.rejects(redeem(rotated.code),/invalid or revoked/);
    const legacyRotated=await rpc('change_game_day',[oldDay.day.id,1,'rotate_code',null,'Replace long code']);
    assert.equal(legacyRotated.code.length,5);
    await assert.rejects(redeem(oldDay.code),/invalid or revoked/);
  });
  await t.test('private generation and code hashes remain inaccessible to visitors',async()=>{
    const samples=(await q('select private.new_day_code() as code from generate_series(1,1000)')).rows.map(row=>row.code);
    assert.ok(new Set(samples).size > 990);
    assert.ok(samples.every(code=>/^[A-HJ-NP-Z2-9]{5}$/.test(code)));
    await assert.rejects(as(null,()=>q('select private.new_day_code()'),'anon'),/permission denied/);
    await assert.rejects(rpc('create_game_day',[group.id,'2026-11-10',lineup],null,'anon'),/permission denied/);
    const day=await rpc('get_game_day',[oldDay.day.id]);
    assert.ok(!('code_hash' in day.day)); assert.ok(!('code' in day));
    await assert.rejects(redeem('0O1I0'),/invalid or revoked/);
  });
});
