import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('game-day editing, searchable list and deletion enforce ownership, versions and atomic results', async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  for(const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
  const q=(sql,args=[])=>db.query(sql,args);
  const owner=randomUUID(),other=randomUUID();
  for(const id of [owner,other]) await q('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`]);
  async function as(user,action,role='authenticated') {
    await db.exec(`begin; set local role ${role};`);
    try { await q("select set_config('request.jwt.claim.sub',$1,true)",[user??'']); const result=await action(); await db.exec('commit'); return result; }
    catch(error) { await db.exec('rollback'); throw error; }
  }
  const rpc=(name,args=[],user=owner,role='authenticated')=>as(user,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args),role).then(result=>result.rows[0].data);
  const group=(await as(owner,()=>q("select * from public.create_group('Tuesday','America/Toronto')"))).rows[0];
  const foreign=(await as(other,()=>q("select * from public.create_group('Other','UTC')"))).rows[0];
  const players=Array.from({length:12},(_,i)=>({id:randomUUID(),name:`Person ${i+1}`}));
  for(const person of players) await rpc('sync_group_player',[group.id,person.id,person.name]);
  const lineup={A:{name:'Home',players:players.slice(0,6)},B:{name:'Away',players:players.slice(6)}};
  const day=await rpc('create_game_day',[group.id,'2026-11-08',lineup]);
  const second=await rpc('create_game_day',[group.id,'2026-11-09',lineup]);
  const load=()=>rpc('get_game_day',[day.day.id]);

  await t.test('list contains team names, counts and no access code or hash',async()=>{
    const list=await rpc('list_game_days',[group.id]);
    assert.equal(list.length,2); assert.equal(list[0].team_a_name,'Home'); assert.equal(list[0].team_b_name,'Away');
    assert.equal(list[0].match_count,0); assert.equal(list[0].published_count,0);
    assert.ok(list.every(row=>!('code_hash' in row) && !('code' in row)));
    await assert.rejects(rpc('list_game_days',[group.id],other),/Only group administrators/);
  });
  await t.test('date edits validate input, detect concurrent changes and preserve codes/lineups',async()=>{
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,'2026-11-09','Change date']),/already exists/);
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,null,'Change date']),/valid date/);
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,'2026-11-10',' ']),/reason/);
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,'2026-11-10','Change'],other),/Only group administrators/);
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,'2026-11-10','Change'],null,'anon'),/permission denied/);
    const edited=await rpc('edit_game_day',[day.day.id,1,'2026-11-10','Rescheduled']);
    assert.equal(edited.play_date,'2026-11-10'); assert.equal(edited.version,2); assert.ok(!('code_hash' in edited));
    await assert.rejects(rpc('edit_game_day',[day.day.id,1,'2026-11-11','Stale']),/Day changed/);
    const current=await load(); assert.deepEqual(current.lineup,lineup); assert.equal(current.history[0].new_state.action,'edit');
    assert.equal((await rpc('redeem_day_code',[day.code],null,'anon')).play_date,'2026-11-10');
  });
  await t.test('deleting a published day removes its matches, private contents and access, preserving other days/players',async()=>{
    const payload={format_version:1,id:randomUUID(),group_id:group.id,started_at:'2026-11-08T23:00:00Z',closed_at:'2026-11-09T01:00:00Z',team_a_name:'Home',team_b_name:'Away',sets:[{team_a_name:'Home',team_b_name:'Away',score_a:1,score_b:0,rosters:{A:players.slice(0,6),B:players.slice(6)},points:[{team:'A',player_id:players[0].id,player_name:players[0].name,is_opponent_error:false}]}]};
    await rpc('receive_day_match',[day.code,payload],null,'anon');
    assert.equal((await rpc('list_game_days',[group.id])).find(row=>row.id===day.day.id).published_count,1);
    let current=await load();
    await rpc('change_game_day',[day.day.id,current.day.version,'close',null,'Publish']);
    const published=(await rpc('list_game_days',[group.id])).find(row=>row.id===day.day.id);
    assert.equal(published.match_count,1); assert.equal(published.published_count,1); assert.equal(published.pending,0);
    const summary=()=>rpc('public_group_summary',[group.id,2026,1],null,'anon');
    assert.equal((await summary()).point_count,1);
    // Editing the schedule of a closed day must not rewrite the played dates/statistics.
    await rpc('edit_game_day',[day.day.id,published.version,'2027-01-01','Schedule correction']);
    assert.equal((await summary()).point_count,1);
    current=await load();
    await assert.rejects(rpc('delete_game_day',[group.id,day.day.id,current.day.version,'Delete'],other),/Only group administrators/);
    await assert.rejects(rpc('delete_game_day',[group.id,day.day.id,current.day.version,'Delete'],null,'anon'),/permission denied/);
    await assert.rejects(rpc('delete_game_day',[foreign.id,day.day.id,current.day.version,'Wrong group'],other),/another group/);
    await assert.rejects(rpc('delete_game_day',[group.id,day.day.id,1,'Stale']),/Day changed/);
    await assert.rejects(rpc('delete_game_day',[group.id,day.day.id,current.day.version,' ']),/reason/);
    assert.equal((await summary()).match_count,1);
    await rpc('delete_game_day',[group.id,day.day.id,current.day.version,'Removed test day']);
    await rpc('delete_game_day',[group.id,day.day.id,current.day.version,'Removed test day']);
    assert.equal((await summary()).match_count,0); assert.equal((await summary()).point_count,0);
    for(const table of ['matches','match_sets','set_players','match_points']) assert.equal((await q(`select count(*)::int n from public.${table} where group_id=$1`,[group.id])).rows[0].n,0);
    for(const table of ['day_receipts','day_lineups','day_audit']) assert.equal((await q(`select count(*)::int n from private.${table} where day_id=$1`,[day.day.id])).rows[0].n,0);
    const list=await rpc('list_game_days',[group.id]); assert.deepEqual(list.map(row=>row.id),[second.day.id]);
    assert.equal((await rpc('get_group_registry',[group.id])).players.length,12);
    await assert.rejects(rpc('redeem_day_code',[day.code],null,'anon'),/invalid or revoked/);
    await assert.rejects(rpc('receive_day_match',[day.code,payload],null,'anon'),/invalid or revoked/);
    await assert.rejects(load(),/Only group administrators/);
    const deletion=(await q('select * from private.day_deletions where day_id=$1',[day.day.id])).rows[0];
    assert.equal(deletion.reason,'Removed test day'); assert.ok(!('code_hash' in deletion.previous_state));
    await assert.rejects(as(owner,()=>q('select * from private.day_deletions')),/permission denied/);
    const replacement=await rpc('create_game_day',[group.id,'2027-01-01',lineup]); assert.notEqual(replacement.day.id,day.day.id);
  });
});
