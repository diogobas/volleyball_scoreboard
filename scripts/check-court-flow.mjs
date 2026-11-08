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
      if(!existing)receipts.push({id:args.p_match.id,day_id:dayId,submission:args.p_match,draft:null,decision:'pending',version:1,audit:[],received_at:new Date().toISOString()});
      result={status:existing?'already_received':'received',match_id:args.p_match.id,day_id:dayId,submission:args.p_match};
    }
    else if(name==='list_my_groups')result=[group];
    else if(name==='list_group_admins')result=[{user_id:userId,email:session.user.email}];
    else if(name==='get_group_registry')result={group,players:people};
    else if(name==='list_game_days')result=[{...day,pending:receipts.filter(r=>r.decision==='pending').length}];
    else if(name==='get_game_day')result={day,lineup,receipts:structuredClone(receipts),history:[],lineups:[{version:1,lineup,created_at:new Date().toISOString()}]};
    else if(name==='review_day_match') {const r=receipts.find(r=>r.id===args.p_match_id);r.draft=args.p_draft;r.decision=args.p_decision;r.version++;day={...day,version:day.version+1};result={status:'reviewed'};}
    else if(name==='change_game_day') {day={...day,state:args.p_action==='close'?'closed':'open',version:day.version+1};result={day};}
    else { console.log('UNEXPECTED',name); return route.abort(); }
    return route.fulfill({headers,json:result});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${baseUrl}/#/app`);
  const saved=()=>page.getByText('Saved on this device',{exact:true}).waitFor();await saved();
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
    await page.getByRole('button',{name:'Change game-day code',exact:true}).waitFor();await saved();
    assert.equal(await edit.count(),0);
  }
  await loadPregameLineup();
  await page.getByRole('button',{name:'Play independently',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Use game-day code',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('volleyball-scoreboard');request.onsuccess=()=>{const db=request.result;const tx=db.transaction('activeMatches');const stored=tx.objectStore('activeMatches').get('current');tx.oncomplete=()=>{db.close();resolve(Boolean(stored.result.state.dayContext));};};})),false);
  await loadPregameLineup();
  await page.evaluate(()=>localStorage.setItem('qaOffline','true'));await page.reload();await saved();
  await page.getByRole('button',{name:'Change game-day code',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add point to Person 1 — Home',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/court-browser/pregame-mobile.png'});
  await page.evaluate(()=>localStorage.setItem('qaOffline','false'));
  await page.getByRole('button',{name:'Add point to Person 1 — Home',exact:true}).click();await saved();
  assert.equal(await page.getByRole('button',{name:'Change game-day code',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Play independently',exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit names',exact:true}).click();assert.equal(await edit.getByRole('button',{name:'Load lineup',exact:true}).isDisabled(),true);await edit.getByLabel('Player 1',{exact:true}).first().fill('Substitute');await edit.getByRole('button',{name:'Save',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Add point to Substitute — Home',exact:true}).click();await saved();
  await page.getByRole('button',{name:'Close set',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Close set',exact:true}).click();await saved();
  await page.evaluate(() => { localStorage.setItem('qaOffline','true'); window.dispatchEvent(new Event('offline')); });await page.getByRole('button',{name:'Save match',exact:true}).click();const save=page.getByRole('dialog',{name:'Save match?',exact:true});assert.equal(await save.getByRole('button',{name:'Save & sync',exact:true}).count(),0);await save.getByRole('button',{name:'Save locally',exact:true}).click();await saved();assert.equal(uploads,0);
  await page.reload();await saved();await page.getByRole('button',{name:'Saved matches (1)',exact:true}).click();await page.getByRole('dialog',{name:'Saved matches · 1 pending',exact:true}).waitFor();await page.screenshot({path:'artifacts/court-browser/saved-mobile.png'});
  await page.evaluate(() => { localStorage.setItem('qaOffline','false'); window.dispatchEvent(new Event('online')); });await page.getByRole('button',{name:'Sync',exact:true}).click();await page.getByText('Received for administrator review. Local copy removed.',{exact:true}).waitFor();assert.equal(uploads,1);assert.equal(receipts[0].submission.sets[0].segments.length,2);
  await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Saved matches (0)',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/court-browser/app-mobile.png'});
  await page.goto(`${baseUrl}/#/admin`);await page.getByLabel(/^Email/).fill('admin@test.local');await page.getByLabel(/^Password/).fill('test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Manage group',exact:true}).click();await page.getByRole('button',{name:'Open day',exact:true}).click();
  const inbox=page.getByRole('button',{name:/Home × Away.*pending/});await inbox.click();
  const unknown=page.getByRole('combobox',{name:'Team A · p1 · Sets 1',exact:true}).last();await unknown.selectOption(people[12].id);
  await page.getByRole('button',{name:'Build draft from associations (replaces draft edits)',exact:true}).click();await page.getByLabel('Reason for review',{exact:true}).fill('Confirm substituted participant');await page.getByRole('button',{name:'Review approval',exact:true}).click();await page.getByRole('button',{name:'Confirm private approval',exact:true}).click();
  await page.getByRole('button',{name:/Home × Away.*approved/}).waitFor();await page.getByLabel('Reason for day change',{exact:true}).fill('Reviewed all results');await page.screenshot({path:'artifacts/court-browser/admin-mobile.png'});await page.getByRole('button',{name:'Close day & publish',exact:true}).click();await page.getByText('Day closed. Results published together.',{exact:true}).waitFor();assert.equal(day.state,'closed');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log('PASS: mobile names, lineup download, offline restart/save, manual sync, segment reconciliation and day publication; no browser exceptions.');
} catch(error) { const p=browser.contexts()[0]?.pages()[0]; if(p){console.log('ERRORS',errors);console.log(await p.locator('body').innerText()); console.log(await p.locator('[role=dialog]').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-labelledby'),label:document.getElementById(n.getAttribute('aria-labelledby'))?.innerText,html:n.outerHTML.slice(0,500)})))); await p.screenshot({path:'artifacts/court-browser/failure.png'});} throw error; } finally {await browser.close();}
