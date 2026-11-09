import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
await mkdir('artifacts/court-browser', { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true});
const group={id:'11111111-1111-4111-8111-111111111111',name:'Court test',time_zone:'America/Toronto'};
const dayId='22222222-2222-4222-8222-222222222222';
const people=Array.from({length:13},(_,i)=>({id:`33333333-3333-4333-8333-${String(i).padStart(12,'0')}`,name:`Person ${i+1}`}));
const lineup={A:{name:'Home',players:people.slice(0,6)},B:{name:'Away',players:people.slice(6,12)}};
let day={id:dayId,group_id:group.id,play_date:'2026-11-07',state:'open',version:1,lineup_version:1};
const code='sample-game-code'; const receipts=[]; const errors=[]; let uploads=0;
const now=Math.floor(Date.now()/1000), userId='44444444-4444-4444-8444-444444444444';
const token=[{alg:'HS256',typ:'JWT'},{sub:userId,email:'admin@test.local',role:'authenticated',exp:now+3600,iat:now}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.'+Buffer.alloc(32).toString('base64url');
const session={access_token:token,refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:userId,email:'admin@test.local',app_metadata:{},user_metadata:{},aud:'authenticated',role:'authenticated'}};
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  // Native builds load bundled local assets even offline. Keep the local server reachable
  // while changing the app's connectivity signal; all external requests are mocked below.
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => localStorage.getItem('qaOffline') !== 'true' }));
  await context.route('**/*',async route=>{
    const request=route.request(), url=new URL(request.url());
    if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return route.continue();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const name=url.pathname.split('/').at(-1),args=request.postData()?request.postDataJSON():{};
    let result;
    if(name==='token')result=session;
    else if(name==='user')result=session.user;
    else if(name==='logout')return route.fulfill({status:204,headers});
    else if(name==='redeem_day_code')result={day_id:dayId,group_id:group.id,group_name:group.name,play_date:day.play_date,lineup_version:1,lineup};
    else if(name==='receive_day_match') {
      uploads++;const existing=receipts.find(r=>r.id===args.p_match.id);
      if(!existing)receipts.push({id:args.p_match.id,day_id:dayId,submission:args.p_match,draft:null,decision:'approved',version:1,audit:[],received_at:new Date().toISOString()});
      result={status:existing?'already_received':'received',published:true,match_id:args.p_match.id,day_id:dayId,submission:args.p_match};
    }
    else if(name==='public_group_period_summary')result={group,period:args.p_period,season:args.p_season??2026,page:args.p_page,page_size:25,seasons:[2026],match_count:0,point_count:0,participant_count:0,fallback_dates:0,matches:[],players:[]};
    else if(name==='list_my_communities')result=[];
    else if(name==='list_my_groups')result=[group];
    else if(name==='list_group_admins')result=[{user_id:userId,email:session.user.email}];
    else if(name==='get_group_registry')result={group,players:people};
    else if(name==='list_group_period_matches')result={group,period:args.p_period,page:1,page_size:args.p_page_size,total:receipts.length,seasons:[2026],matches:receipts.map(r=>({id:r.id,version:1,started_at:r.submission.started_at,closed_at:r.submission.closed_at,team_a_name:r.submission.team_a_name,team_b_name:r.submission.team_b_name,sets_a:1,sets_b:0,sets:r.submission.sets}))};
    else if(name==='public_match_details') {
      const r=receipts.find(r=>r.id===args.p_match_id), m=r.submission;
      result={...m,id:r.id,version:1,group,sets_a:1,sets_b:0,sets:m.sets.map((set,index)=>{
        const rows=[];
        for(const segment of set.segments)for(const team of ['A','B'])for(const p of segment.rosters[team])if(!rows.some(row=>row.key===p.key))rows.push({key:p.key,id:p.hint_id??people[12].id,name:p.name,team,position:rows.filter(row=>row.team===team).length+1,points:set.points.filter(point=>point.participant_key===p.key).length});
        return {...set,number:index+1,players:rows,errors_a:set.points.filter(p=>p.team==='A'&&p.is_opponent_error).length,errors_b:set.points.filter(p=>p.team==='B'&&p.is_opponent_error).length};
      })};
    }
    else if(name==='list_game_days')result=[{...day,pending:receipts.filter(r=>r.decision==='pending').length}];
    else if(name==='get_game_day')result={day,lineup,receipts:structuredClone(receipts),history:[],lineups:[{version:1,lineup,created_at:new Date().toISOString()}]};
    else if(name==='review_day_match') {const r=receipts.find(r=>r.id===args.p_match_id);r.draft=args.p_draft;r.decision=args.p_decision;r.version++;day={...day,version:day.version+1};result={status:'reviewed'};}
    else if(name==='change_game_day') {day={...day,state:args.p_action==='close'?'closed':'open',version:day.version+1};result={day};}
    else { console.log('UNEXPECTED',name); return route.abort(); }
    return route.fulfill({headers,json:result});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${baseUrl}/#/app`);
  const saved=()=>page.getByText('Saved on this device',{exact:true}).waitFor();await saved();
  const actionLabels = async () => (await page.locator('.actions button').allTextContents()).map(text=>text.trim());
  assert.deepEqual(await actionLabels(),['Undo','Close set','Edit names','Switch sides']);
  await page.getByRole('tab',{name:'Statistics',exact:true}).click();
  assert.deepEqual(await actionLabels(),['Save match','Saved matches (0)']);
  assert.equal(await page.getByRole('button',{name:'Save match',exact:true}).isDisabled(),true);
  await page.getByRole('tab',{name:'Game',exact:true}).click();
  for(const old of ['Account & groups','Players & sync','Public results'])assert.equal(await page.getByRole('button',{name:old,exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit names',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit teams and players'});
  await edit.getByLabel('Player 1',{exact:true}).first().fill('Operator edit');
  await edit.getByRole('button',{name:'Save',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Use game-day code',exact:true}).click();
  const link=page.getByRole('dialog',{name:'Game-day code',exact:true});
  await link.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Add point to Operator edit — Team 1',exact:true}).waitFor();
  async function loadPregameLineup() {
    await page.getByRole('button',{name:'Use game-day code',exact:true}).click();
    await link.getByLabel(/^Code/).fill(code);await link.getByRole('button',{name:'Check code',exact:true}).click();
    await link.getByText('Court test · 2026-11-07',{exact:true}).waitFor();
    await link.getByRole('button',{name:'Load lineup',exact:true}).click();
    await page.getByRole('button',{name:'Add point to Person 1 — Home',exact:true}).waitFor();await saved();
    assert.equal(await page.locator('[aria-label="Match setup"]').count(),0);
    assert.equal(await page.getByRole('button',{name:'Change game-day code',exact:true}).count(),0);
    assert.ok(Math.abs(await page.locator('.court').evaluate(node=>node.getBoundingClientRect().top)) < 2);
    assert.equal(await edit.count(),0);
  }
  await page.getByRole('button',{name:'Play independently',exact:true}).click();await saved();
  assert.equal(await page.getByRole('button',{name:'Use game-day code',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Play independently',exact:true}).count(),0);
  assert.equal(await page.getByText('Independent match. Edit names or start scoring whenever you are ready.',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('volleyball-scoreboard');request.onsuccess=()=>{const db=request.result;const tx=db.transaction('activeMatches');const stored=tx.objectStore('activeMatches').get('current');tx.oncomplete=()=>{db.close();resolve(Boolean(stored.result.state.dayContext));};};})),false);
  await page.reload();await saved();
  await loadPregameLineup();
  await page.evaluate(()=>localStorage.setItem('qaOffline','true'));await page.reload();await saved();
  assert.equal(await page.locator('[aria-label="Match setup"]').count(),0);
  await page.getByRole('button',{name:'Add point to Person 1 — Home',exact:true}).waitFor();
  assert.ok(Math.abs(await page.locator('.court').evaluate(node=>node.getBoundingClientRect().top)) < 2);
  await page.screenshot({path:'artifacts/court-browser/pregame-mobile.png'});
  await page.evaluate(()=>localStorage.setItem('qaOffline','false'));
  await page.getByRole('button',{name:'Add point to Person 1 — Home',exact:true}).click();await saved();
  assert.equal(await page.getByRole('button',{name:'Change game-day code',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Play independently',exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit names',exact:true}).click();assert.equal(await edit.getByRole('button',{name:'Load lineup',exact:true}).isDisabled(),true);await edit.getByLabel('Player 1',{exact:true}).first().fill('Substitute');await edit.getByRole('button',{name:'Save',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Add point to Substitute — Home',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Close set',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Close set',exact:true}).click();await saved();
  await page.getByRole('tab',{name:'Statistics',exact:true}).click();
  assert.equal(await page.getByRole('progressbar',{name:'Points for Substitute — Home',exact:true}).getAttribute('aria-valuetext'),'2 points');
  assert.equal(await page.getByRole('list',{name:'Top 3 players',exact:true}).getByRole('listitem').count(),1);
  await page.evaluate(() => { localStorage.setItem('qaOffline','true'); window.dispatchEvent(new Event('offline')); });await page.getByRole('button',{name:'Save match',exact:true}).click();const save=page.getByRole('dialog',{name:'Save match?',exact:true});assert.equal(await save.getByRole('button',{name:'Save & sync',exact:true}).count(),0);await save.getByRole('button',{name:'Save locally',exact:true}).click();await saved();assert.equal(uploads,0);
  await page.reload();await saved();await page.getByRole('tab',{name:'Statistics',exact:true}).click();await page.getByRole('button',{name:'Saved matches (1)',exact:true}).click();await page.getByRole('dialog',{name:'Saved matches · 1 pending',exact:true}).waitFor();await page.screenshot({path:'artifacts/court-browser/saved-mobile.png'});
  // Add a second unlinked archive and discard it offline, retaining the original for sync.
  const currentBeforeDeletion = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('volleyball-scoreboard'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['activeMatches', 'closedMatches'], 'readwrite');
      const active = tx.objectStore('activeMatches').get('current'); const archives = tx.objectStore('closedMatches').getAll();
      archives.onsuccess = () => { const copy = structuredClone(archives.result[0]); copy.id = 'discard-offline-test'; delete copy.dayContext; delete copy.state.dayContext; tx.objectStore('closedMatches').put(copy); };
      tx.oncomplete = () => resolve(active.result); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const savedDialog = page.getByRole('dialog', { name: 'Saved matches · 2 pending', exact: true });
  await savedDialog.waitFor();
  const unlinked = savedDialog.locator('.MuiPaper-root').filter({ has: page.getByText('No day linked yet', { exact: true }) });
  await unlinked.getByRole('button', { name: 'Delete local match', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Delete saved match?', exact: true });
  await discard.waitFor();
  await page.screenshot({ path: 'artifacts/court-browser/delete-local-match-mobile.png' });
  await discard.getByRole('button', { name: 'Keep match', exact: true }).click();
  await savedDialog.waitFor(); assert.equal(uploads, 0);
  await unlinked.getByRole('button', { name: 'Delete local match', exact: true }).click();
  await discard.getByRole('button', { name: 'Delete match', exact: true }).click();
  await page.getByRole('dialog', { name: 'Saved matches · 1 pending', exact: true }).waitFor();
  await page.getByText('Local match deleted.', { exact: true }).waitFor();
  assert.equal(uploads, 0);
  const afterDeletion = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('volleyball-scoreboard'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(['activeMatches', 'closedMatches']);
      const active = tx.objectStore('activeMatches').get('current'); const archives = tx.objectStore('closedMatches').getAll();
      tx.oncomplete = () => resolve({ active: active.result, ids: archives.result.map(match => match.id) }); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  });
  assert.deepEqual(afterDeletion.active, currentBeforeDeletion);
  assert.equal(afterDeletion.ids.length, 1); assert.ok(!afterDeletion.ids.includes('discard-offline-test'));
  await page.reload(); await saved(); await page.getByRole('tab', { name: 'Statistics', exact: true }).click();
  await page.getByRole('button', { name: 'Saved matches (1)', exact: true }).click();
  await page.getByRole('dialog', { name: 'Saved matches · 1 pending', exact: true }).waitFor();
  await page.evaluate(() => { localStorage.setItem('qaOffline','false'); window.dispatchEvent(new Event('online')); });await page.getByRole('button',{name:'Sync',exact:true}).click();await page.getByText('Match finalized and synced. Local copy removed.',{exact:true}).waitFor();assert.equal(uploads,1);assert.equal(receipts[0].submission.sets[0].segments.length,2);
  await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Saved matches (0)',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Game',exact:true}).click();
  assert.deepEqual(await actionLabels(),['Undo','Close set','Edit names','Switch sides']);
  await page.screenshot({path:'artifacts/court-browser/app-mobile.png'});
  await page.goto(`${baseUrl}/#/admin`);await page.getByLabel(/^Email/).fill('admin@test.local');await page.getByLabel(/^Password/).fill('test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Manage group',exact:true}).click();await page.getByRole('tablist',{name:'Administration sections'}).getByRole('tab',{name:'Game days',exact:true}).click();await page.getByRole('button',{name:'Open day',exact:true}).click();
  await page.getByRole('heading',{name:'Finalized matches',exact:true}).waitFor();
  await page.getByRole('button',{name:'View match',exact:true}).click();
  await page.getByRole('heading',{name:'Top 3',exact:true}).waitFor();
  assert.equal(receipts[0].decision,'approved');
  assert.equal(await page.getByRole('button',{name:'Review approval',exact:true}).count(),0);
  assert.equal(await page.getByRole('progressbar',{name:'Points for Substitute — Home',exact:true}).getAttribute('aria-valuetext'),'1 points');
  await page.getByRole('button',{name:'← Back to matches',exact:true}).click();
  await page.getByRole('tablist',{name:'Game day sections'}).getByRole('tab',{name:'Code & status',exact:true}).click();
  await page.getByLabel('Reason for day change',{exact:true}).fill('End game day');
  await page.screenshot({path:'artifacts/court-browser/admin-mobile.png'});
  await page.getByRole('button',{name:'Close day',exact:true}).click();
  await page.getByText('Day closed.',{exact:true}).waitFor(); assert.equal(day.state,'closed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(`${baseUrl}/#/app`);
  await page.getByRole('link',{name:'Privacy policy',exact:true}).click();
  await page.getByRole('heading',{name:'Privacy Policy',exact:true}).waitFor();
  await page.getByRole('heading',{name:'6. Contact and privacy requests',exact:true}).waitFor();
  assert.ok(await page.getByRole('link',{name:'diogovvb@gmail.com',exact:true}).count());
  assert.equal(new URL(page.url()).pathname,'/privacy.html');
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile names, lineup download, offline restart/save, offline deletion/cancellation/restart, automatic match finalization and day closure; no browser exceptions.');
} catch(error) { const p=browser.contexts()[0]?.pages()[0]; if(p){console.log('ERRORS',errors);console.log(await p.locator('body').innerText()); console.log(await p.locator('[role=dialog]').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-labelledby'),label:document.getElementById(n.getAttribute('aria-labelledby'))?.innerText,html:n.outerHTML.slice(0,500)})))); await p.screenshot({path:'artifacts/court-browser/failure.png'});} throw error; } finally {await browser.close();}
