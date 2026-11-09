import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const target = '653c2c8d-9903-4410-b109-c66320f7300c';
const targetName = 'Tuesday Volleyball ‐ 7:30PM-10PM';
const fixedNames = ['Anderson','Carlos','Chicó','Diogo','Diego','Geraldo','Jota','KJ','Gaëtan','Phillip','Omer','Kaue','Dimitri'];

test('administrator player lifecycle, access, history and targeted reset', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    revoke all on auth.users from public,anon,authenticated;`);
  for (const file of (await readdir(new URL('./migrations/',import.meta.url))).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`./migrations/${file}`,import.meta.url),'utf8'));
  }
  const q = (sql,args=[]) => db.query(sql,args);
  const owner=randomUUID(), outsider=randomUUID();
  for (const id of [owner,outsider]) await q('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`]);
  await q('insert into public.groups(id,name,time_zone) values($1,$2,$3)',[target,targetName,'America/Toronto']);
  await q('insert into private.group_admins(group_id,user_id,added_by) values($1,$2,$2)',[target,owner]);
  async function as(user, action, role='authenticated') {
    await db.exec(`begin; set local role ${role};`);
    try { await q("select set_config('request.jwt.claim.sub',$1,true)",[user ?? '']); const result=await action(); await db.exec('commit'); return result; }
    catch(error) { await db.exec('rollback'); throw error; }
  }
  const rpc = (name,args) => as(owner,()=>q(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args)).then(result=>result.rows[0].data);
  const playerId=randomUUID();
  await t.test('create/edit categories, names and versioned retries',async()=>{
    let player=await rpc('save_group_player',[target,playerId,' Chicó ','fixed',null]);
    assert.equal(player.name,'Chicó'); assert.equal(player.category,'fixed'); assert.equal(player.version,1);
    assert.deepEqual(await rpc('save_group_player',[target,playerId,' Chicó ','fixed',null]),player);
    player=await rpc('save_group_player',[target,playerId,'Chicó Silva','sub',1]);
    assert.equal(player.version,2); assert.equal(player.category,'sub');
    await assert.rejects(rpc('save_group_player',[target,playerId,'Stale edit','fixed',1]),/changed/);
    await assert.rejects(rpc('save_group_player',[target,randomUUID(),'Chico Silva','sub',null]),/already exists/);
    await assert.rejects(rpc('save_group_player',[target,randomUUID(),'  ','fixed',null]),/Provide/);
    await assert.rejects(rpc('save_group_player',[target,randomUUID(),'Name','other',null]),/valid category/);
    const fromApp=await rpc('sync_group_player',[target,randomUUID(),'App player']); assert.equal(fromApp.player.category,'sub');
  });
  await t.test('only this group administrator can create, edit or delete',async()=>{
    const other=(await as(outsider,()=>q("select * from public.create_group('Other group','UTC')"))).rows[0];
    for (const role of ['anon','authenticated']) {
      await assert.rejects(as(outsider,()=>q('select public.save_group_player($1,$2,$3,$4,$5)',[target,randomUUID(),'Blocked','sub',null]),role),/permission denied|Only group administrators/);
      await assert.rejects(as(outsider,()=>q('select public.delete_group_player($1,$2,$3)',[target,playerId,2]),role),/permission denied|Only group administrators/);
    }
    await assert.rejects(as(outsider,()=>q('select public.save_group_player($1,$2,$3,$4,$5)',[other.id,playerId,'Moved','fixed',2])),/another group/);
    await assert.rejects(as(owner,()=>q("update public.players set category='fixed' where id=$1",[playerId])),/permission denied/);
  });
  await t.test('delete preserves recorded results and prevents old sync resurrection',async()=>{
    const historicalMatch=randomUUID();
    await q("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values($1,$2,now(),1,0,'{}')",[historicalMatch,target]);
    await q('insert into public.match_sets values($1,$2,1,1,0)',[historicalMatch,target]);
    await q("insert into public.set_players values($1,$2,1,'A',1,$3,'Original name')",[historicalMatch,target,playerId]);
    await q("insert into public.match_points values($1,$2,1,1,'A',$3,'Original name',false)",[historicalMatch,target,playerId]);
    await assert.rejects(rpc('delete_group_player',[target,playerId,1]),/changed/);
    await rpc('delete_group_player',[target,playerId,2]); await rpc('delete_group_player',[target,playerId,2]);
    const registry=await rpc('get_group_registry',[target]);
    assert.ok(!registry.players.some(player=>player.id===playerId)); assert.ok(registry.deleted_player_ids.includes(playerId));
    const historical = (await as(null,()=>q('select public.public_match_details($1,$2) as data',[target,historicalMatch]),'anon')).rows[0].data;
    assert.equal(historical.sets[0].players[0].name,'Original name');
    assert.equal(historical.sets[0].players[0].points,1);
    const summary = (await as(null,()=>q('select public.public_group_summary($1,null,1) as data',[target]),'anon')).rows[0].data;
    assert.equal(summary.players.find(player=>player.id===playerId).removed,true);
    assert.equal(summary.point_count,1);
    await assert.rejects(rpc('sync_group_player',[target,playerId,'Chicó Silva']),/deleted/);
    await assert.rejects(rpc('save_group_player',[target,playerId,'Chicó Silva','fixed',3]),/deleted/);
    const replacement=await rpc('save_group_player',[target,randomUUID(),'Chicó Silva','fixed',null]); assert.equal(replacement.category,'fixed');
  });
  await t.test('reset clears only the requested group and seeds exactly thirteen Fixed players',async()=>{
    const other=(await q("select id from public.groups where name='Other group'")).rows[0].id;
    await q("insert into public.players(group_id,name) values($1,'Untouched')",[other]);
    const old=(await rpc('get_group_registry',[target])).players;
    const match=randomUUID(),day=randomUUID();
    await q("insert into public.matches(id,group_id,closed_at,sets_a,sets_b,snapshot) values($1,$2,now(),1,0,'{}')",[match,target]);
    await q('insert into public.match_sets values($1,$2,1,1,0)',[match,target]);
    await q("insert into public.set_players values($1,$2,1,'A',1,$3,$4)",[match,target,old[0].id,old[0].name]);
    await q("insert into public.match_points values($1,$2,1,1,'A',$3,$4,false)",[match,target,old[0].id,old[0].name]);
    await q("insert into private.game_days(id,group_id,play_date) values($1,$2,current_date)",[day,target]);
    await q("insert into private.day_lineups(day_id,version,lineup) values($1,1,'{}')",[day]);
    await q("insert into private.day_receipts(id,day_id,submission) values($1,$2,'{}')",[match,day]);
    await q("insert into private.day_audit(day_id,version,author_id,reason,previous_state,new_state) values($1,1,$2,'Test','{}','{}')",[day,owner]);
    const maintenance=await readFile(new URL('./maintenance/reset-tuesday-volleyball.sql',import.meta.url),'utf8');
    await db.exec(maintenance);
    const registry=await rpc('get_group_registry',[target]);
    assert.deepEqual(registry.players.map(player=>player.name).sort(),[...fixedNames].sort());
    assert.ok(registry.players.every(player=>player.category==='fixed'));
    for (const table of ['matches','match_sets','set_players','match_points']) assert.equal((await q(`select count(*)::int as n from public.${table} where group_id=$1`,[target])).rows[0].n,0);
    assert.equal((await q('select count(*)::int as n from private.game_days where group_id=$1',[target])).rows[0].n,0);
    for (const table of ['day_lineups','day_receipts','day_audit']) assert.equal((await q(`select count(*)::int as n from private.${table} where day_id=$1`,[day])).rows[0].n,0);
    assert.equal((await q('select count(*)::int as n from public.players where group_id=$1 and deleted_at is null',[other])).rows[0].n,1);
    const summary=await as(null,()=>q('select public.public_group_summary($1,null,1) as data',[target]),'anon');
    for(const field of ['match_count','point_count','participant_count']) assert.equal(summary.rows[0].data[field],0);
    assert.equal(summary.rows[0].data.players.length,13);
    assert.ok(summary.rows[0].data.players.every(player=>player.category==='fixed'));
    assert.equal((await q('select count(*)::int as n from private.group_admins where group_id=$1',[target])).rows[0].n,1);
    await assert.rejects(db.exec(maintenance),/already applied/); await db.exec('rollback');
    assert.equal((await rpc('get_group_registry',[target])).players.length,13);
  });
});
