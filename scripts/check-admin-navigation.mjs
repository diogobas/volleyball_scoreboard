import { matchResult } from '../src/game/matchResult';
import { currentPeriod, periodTitle } from '../src/game/seasonPeriods';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Public navigation test', display_id: 'G-1', time_zone: 'America/Toronto' };
const allMatches = Array.from({ length: 26 }, (_, i) => ({
  id: `22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,
  started_at: '2025-11-07T23:00:00Z', closed_at: '2025-11-08T01:00:00Z',
  team_a_name: `Home ${i+1}`, team_b_name: 'Away', sets_a: 1, sets_b: 0, version: 1, sets: [{ score_a: 25, score_b: 20 }],
}));
const players = [{ id: 'player-a', name: 'Alex', category: 'fixed', points: 20, matches: 4, wins: 2, days: 2 }, { id: 'player-b', name: 'Sam', category: 'sub', points: 0, matches: 0, wins: 0, days: 0 }];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
  const user = { id: '33333333-3333-4333-8333-333333333333', email: 'admin@example.test', aud: 'authenticated', role: 'authenticated' };
  let registryPlayers = ['Anderson','Carlos','Chicó','Diogo','Diego','Geraldo','Jota','KJ','Gaëtan','Phillip','Omer','Kaue','Dimitri'].map((name, index) => ({ id: `player-${index}`, group_id: group.id, name, display_id: `P-${index+1}`, category: 'fixed', version: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => ({ id: `day-${i}`, play_date: `2026-11-${String(8-i).padStart(2, '0')}`, state: i === 6 ? 'closed' : 'open', pending: 0, version: 1, lineup_version: 1, match_count: i === 5 ? 1 : 0, published_count: i === 5 ? 1 : 0, team_a_name: 'Home', team_b_name: 'Away' }));
  const dayLineups = new Map(); const matchDrafts = new Map(); const historicalMatches = new Map();
  await page.context().route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const name = url.pathname.split('/').at(-1);
    const args = request.postDataJSON();
    let json;
    if (name === 'token') json = { access_token: 'mock-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user };
    else if (name === 'logout') json = {};
    else if (name === 'user') json = user;
    else if (name === 'list_my_communities') json = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_id: 'C-1', name: 'Montreal Volleyball Community', region: 'Montreal' }];
    else if (name === 'list_my_groups') json = [group];
    else if (name === 'public_group_info') json = group;
    else if (name === 'public_player_profile') {
      const player = registryPlayers.find(player => player.id === args.p_player_ref || player.display_id === args.p_player_ref);
      json = { group, player, season: args.p_season ?? 2026, period: args.p_period, seasons: [2026,2025], page: args.p_page, page_size: args.p_page_size, match_count: 0, matches: [], statistics: { points: 0, matches: 0, wins: 0, days: 0, attendance_day_count: 0 } };
    }
    else if (name === 'list_group_admins') json = [{ user_id: user.id, email: user.email }];
    else if (name === 'get_group_registry') json = { group, players: registryPlayers, deleted_player_ids: [] };
    else if (name === 'save_group_player_profile') {
      const previous = registryPlayers.find(player => player.id === args.p_player_id);
      if (registryPlayers.some(player => player.id !== args.p_player_id && player.name.toLowerCase() === args.p_name.toLowerCase())) return route.fulfill({ status: 409, headers, json: { code: '23505', message: 'A player with this name already exists in this group.' } });
      json = { id: args.p_player_id, group_id: args.p_group_id, name: args.p_name, category: args.p_category, sex: args.p_sex, preferred_positions: args.p_preferred_positions, version: (previous?.version ?? 0) + 1 };
      registryPlayers = [...registryPlayers.filter(player => player.id !== json.id), json];
    }
    else if (name === 'delete_group_player') { registryPlayers = registryPlayers.filter(player => player.id !== args.p_player_id); json = null; }
    else if (name === 'list_game_days') json = days;
    else if (name === 'get_game_day') json = { day: days.find(day => day.id === args.p_day_id), lineup: dayLineups.get(args.p_day_id) ?? { A: { name: 'Home', players: Array(6).fill(null) }, B: { name: 'Away', players: Array(6).fill(null) } }, receipts: args.p_day_id === 'day-5' ? [{ id: allMatches[0].id, decision: 'approved' }] : [], lineups: [], history: [] };
    else if (name === 'create_game_day') {
      const day = { id: 'created-day', play_date: args.p_date, state: 'open', version: 1, lineup_version: 1, pending: 0, match_count: 0, published_count: 0, team_a_name: args.p_lineup.A.name, team_b_name: args.p_lineup.B.name };
      dayLineups.set(day.id, args.p_lineup); days.unshift(day); json = { day, code: 'AB7K9' };
    }
    else if (name === 'edit_game_day') {
      const day = days.find(day => day.id === args.p_day_id);
      if (days.some(other => other.id !== day.id && other.play_date === args.p_date)) return route.fulfill({ status: 409, headers, json: { code: '23505', message: 'A game day already exists on this date.' } });
      day.play_date = args.p_date; day.version++; json = day;
    }
    else if (name === 'change_game_day') {
      const day = days.find(day => day.id === args.p_day_id);
      if (args.p_action !== 'lineup') throw new Error('Unexpected day action');
      dayLineups.set(day.id, args.p_lineup); day.lineup_version++; day.version++;
      day.team_a_name = args.p_lineup.A.name; day.team_b_name = args.p_lineup.B.name;
      json = { day };
    }
    else if (name === 'delete_game_day') {
      const index = days.findIndex(day => day.id === args.p_day_id);
      if (index >= 0) days.splice(index, 1); dayLineups.delete(args.p_day_id); json = null;
    }
    else if (name === 'save_historical_match') {
      const source = args.p_match; const existing = historicalMatches.get(source.id); const version = (existing?.version ?? 1) + 1;
      const payload = structuredClone(source); payload.players = payload.players.map((player,index)=>({ ...player, player_id: player.player_id ?? registryPlayers.find(p=>p.name===player.name)?.id ?? `historical-${index}` }));
      historicalMatches.set(payload.id, { payload, version });
      const outcome = matchResult(payload.sets, { endedAsDraw: payload.ended_as_draw, rules: payload.rules });
      const record = { id: payload.id, version, entry_mode: 'summary', player_totals_recorded: payload.player_totals_recorded, played_on: payload.played_on, closed_at: `${payload.played_on}T17:00:00Z`, started_at: null, rules: payload.rules, team_a_name: payload.team_a_name, team_b_name: payload.team_b_name, sets_a: outcome.setsA, sets_b: outcome.setsB, winner: outcome.winner, decided_at: outcome.decidedAt, ended_as_draw: payload.ended_as_draw ?? false, draw_interrupted_set: outcome.sets.findIndex(set => set.interrupted) + 1 || null, sets: payload.sets };
      const index = allMatches.findIndex(m=>m.id===payload.id); if(index>=0) allMatches[index]=record; else allMatches.unshift(record);
      json = { id: payload.id, version };
    }
    else if (name === 'get_historical_match') { const match = historicalMatches.get(args.p_match_id); json = { version: match.version, payload: match.payload, players: registryPlayers }; }
    else if (name === 'public_match_details' && historicalMatches.has(args.p_match_id)) {
      const {payload,version}=historicalMatches.get(args.p_match_id);
      json = { ...allMatches.find(m=>m.id===args.p_match_id), group, group_id: group.id, version, players: payload.players.map(p=>({id:p.player_id,name:p.name,team:p.team,points:p.points})), errors_a:payload.errors_a, errors_b:payload.errors_b,
        sets:payload.sets.map((set,index)=>({...set,number:index+1,training:allMatches.find(match=>match.id===args.p_match_id).decided_at != null && index >= allMatches.find(match=>match.id===args.p_match_id).decided_at,statistics_available:false,players:[],team_a_name:payload.team_a_name,team_b_name:payload.team_b_name,errors_a:0,errors_b:0})) };
    }
    else if (name === 'list_group_period_matches') {
      const filtered = args.p_day_id ? (args.p_day_id === 'day-5' ? [allMatches[0]] : []) : allMatches.filter(match => !args.p_query || `${match.team_a_name} ${match.team_b_name} Alex`.toLowerCase().includes(args.p_query.toLowerCase()));
      const pageNumber = Math.max(1, Math.min(args.p_page, Math.ceil(filtered.length / args.p_page_size)));
      json = { group, period: args.p_period, total: filtered.length, page: pageNumber, page_size: args.p_page_size, seasons: [2026,2025], matches: filtered.slice((pageNumber-1)*args.p_page_size,pageNumber*args.p_page_size) };
    }
    else if (name === 'get_match_for_edit') {
      const record = allMatches.find(match => match.id === args.p_match_id);
      const payload = matchDrafts.get(args.p_match_id) ?? { format_version: 1, id: record.id, group_id: group.id, started_at: record.started_at, closed_at: record.closed_at, team_a_name: record.team_a_name, team_b_name: record.team_b_name,
        sets: [{ team_a_name: record.team_a_name, team_b_name: record.team_b_name, score_a: 1, score_b: 0, rosters: { A: registryPlayers.slice(0,6).map(p=>({id:p.id,name:p.name})), B: registryPlayers.slice(6,12).map(p=>({id:p.id,name:p.name})) }, points: [{ team: 'A', player_id: registryPlayers[0].id, player_name: registryPlayers[0].name, is_opponent_error: false }] }] };
      json = { group, payload, version: record.version, players: registryPlayers };
    }
    else if (name === 'correct_match') {
      const record = allMatches.find(match => match.id === args.p_match_id); record.version++; record.team_a_name = args.p_match.team_a_name; record.team_b_name = args.p_match.team_b_name; matchDrafts.set(record.id, args.p_match);
      json = { status: 'corrected', group_id: group.id, match_id: record.id, revision_id: args.p_revision_id, version: record.version, current_version: record.version };
    }
    else if (name === 'delete_final_match') throw new Error('Finalized match deletion must never be requested');
    else if (name === 'public_group_period_summary') json = { group, period: args.p_period, season: args.p_season ?? 2026, page: args.p_page, page_size: 25, seasons: [2026, 2025], match_count: allMatches.length, participant_count: 1, attendance_day_count: 3, point_count: 20, fallback_dates: 0, players, matches: allMatches.slice((args.p_page-1)*25, args.p_page*25) };
    else if (name === 'public_match_details') json = { group, group_id: group.id, id: args.p_match_id, team_a_name: allMatches.find(match=>match.id===args.p_match_id)?.team_a_name ?? 'Home', team_b_name: 'Away', version: allMatches.find(match=>match.id===args.p_match_id)?.version ?? 1, sets_a: 1, sets_b: 0, started_at: '2026-11-08T12:00:00Z', sets: [{ number: 1, team_a_name: 'Home', team_b_name: 'Away', score_a: 4, score_b: 2, errors_a: 1, errors_b: 0, players: [{ id: 'alex', name: 'Alex', team: 'A', position: 1, points: 3 }, { id: 'chris', name: 'Chris', team: 'B', position: 1, points: 2 }] }] };
    else throw new Error(`Unexpected external request: ${name}`);
    return route.fulfill({ headers, json });
  });
  await page.goto(`${baseUrl}/#/admin`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await page.locator('input[type="password"]').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'My groups', exact: true }).waitFor();
  const account = page.getByRole('button', { name: 'Account menu — signed in', exact: true });
  assert.equal(await page.getByText(user.email, { exact: true }).isVisible(), false);
  await account.click();
  await page.getByText(user.email, { exact: true }).waitFor();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const workspace = page.getByRole('tablist', { name: 'Workspace sections' });
  const workspaceMenu = page.getByRole('button', { name: 'Administration · My groups', exact: true });
  assert.equal(await workspaceMenu.getAttribute('aria-expanded'), 'false');
  await workspaceMenu.click();
  assert.equal(await workspace.getAttribute('aria-orientation'), 'vertical');
  await workspaceMenu.click();
  assert.equal(await workspaceMenu.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByRole('textbox', { name: 'Group name', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const createGroup = page.getByRole('dialog', { name: 'Create group', exact: true });
  await createGroup.getByRole('textbox', { name: 'Group name', exact: true }).fill('Test group');
  assert.equal(await page.getByRole('textbox', { name: 'Time zone', exact: true }).count(), 0);
  await createGroup.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Manage group', exact: true }).click();
  const nav = page.getByRole('tablist', { name: 'Administration sections' });
  assert.notEqual(await nav.getAttribute('aria-orientation'), 'vertical');
  const tab = async name => { await nav.getByRole('tab', { name, exact: true }).click(); };
  await page.getByRole('heading', { name: `Season overview · ${periodTitle(2026, currentPeriod())}` }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add administrator' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open day' }).count(), 0);
  await page.getByRole('link', { name: 'View matches', exact: true }).click();
  await page.getByRole('heading', { name: 'Finalized matches' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'View match', exact: true }).count(), 5);
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'View match', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Top 3', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit match', exact: true }).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: /^Points for Alex — Home/ }).getAttribute('aria-valuetext'), '3 points');
  await page.getByRole('button', { name: '← Back to matches', exact: true }).click();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor();
  await tab('Players');
  await page.getByRole('button', { name: 'Add player', exact: true }).waitFor();
  await page.getByText('P-1', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search players' }).fill('P-13');
  await page.getByRole('link', { name: 'View profile for Dimitri', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Edit / }).count(), 0);
  await page.getByRole('textbox', { name: 'Search players' }).fill('');
  assert.equal(await page.getByRole('table').count(), 0);
  await page.getByRole('button', { name: 'Add player', exact: true }).click();
  const playerForm = page.getByRole('dialog', { name: 'Add player', exact: true });
  await playerForm.getByRole('textbox', { name: 'Player name' }).fill('Visitor');
  assert.equal(await playerForm.getByRole('combobox', { name: 'Player category' }).inputValue(), 'sub');
  await playerForm.getByRole('combobox', { name: 'Sex', exact: true }).selectOption('female');
  await playerForm.getByRole('checkbox', { name: 'Setter (S)', exact: true }).check();
  await playerForm.getByRole('checkbox', { name: 'Outside Hitter (O)', exact: true }).check();
  await playerForm.getByRole('button', { name: 'Save player', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search players' }).fill('Visitor');
  assert.equal(await page.getByRole('button', { name: /^Edit / }).count(), 0);
  const profileHref = await page.getByRole('link', { name: 'View profile for Visitor', exact: true }).getAttribute('href');
  const profilePage = await page.context().newPage();
  await profilePage.goto(`${baseUrl}/${profileHref}`);
  await profilePage.getByRole('button', { name: 'Edit player', exact: true }).click();
  const editForm = profilePage.getByRole('dialog', { name: 'Edit player', exact: true });
  assert.equal(await editForm.getByRole('combobox', { name: 'Sex', exact: true }).inputValue(), 'female');
  assert.equal(await editForm.getByRole('checkbox', { name: 'Setter (S)', exact: true }).isChecked(), true);
  assert.equal(await editForm.getByRole('checkbox', { name: 'Outside Hitter (O)', exact: true }).isChecked(), true);
  assert.equal(await editForm.getByRole('checkbox', { name: 'Opposite Hitter (OH)', exact: true }).isChecked(), false);
  await editForm.getByRole('textbox', { name: 'Player name' }).fill('Anderson');
  await editForm.getByRole('button', { name: 'Save player', exact: true }).click();
  await editForm.getByText('A player with this name already exists in this group.').waitFor();
  await editForm.getByRole('textbox', { name: 'Player name' }).fill('Visitor Updated');
  await editForm.getByRole('combobox', { name: 'Player category' }).selectOption('fixed');
  await editForm.getByRole('button', { name: 'Save player', exact: true }).click();
  await profilePage.getByRole('heading', { name: 'Visitor Updated', exact: true }).waitFor();
  await profilePage.close();
  await page.getByRole('button', { name: 'Refresh players', exact: true }).click();
  await page.getByText('Players refreshed.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('sub');
  await page.getByText('No players match this search.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('fixed');
  await page.getByRole('button', { name: 'Delete Visitor Updated', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete Visitor Updated?', exact: true }).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete Visitor Updated', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete Visitor Updated?', exact: true }).getByRole('button', { name: 'Delete player', exact: true }).click();
  await page.getByText('No players match this search.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search players' }).fill('');
  await page.getByRole('combobox', { name: 'Players per page' }).selectOption('25');
  assert.equal(await page.getByRole('link', { name: /^View profile for / }).count(), 13);
  assert.equal(await page.getByRole('button', { name: /^Edit / }).count(), 0);
  await mkdir('artifacts/admin-navigation', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-navigation/players-mobile.png', fullPage: true });
  await page.getByRole('tablist', { name: 'Player sections' }).getByRole('tab', { name: 'Statistics', exact: true }).click();
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2025');
  await page.getByRole('table', { name: `Player statistics for season ${periodTitle(2025, currentPeriod())}` }).waitFor();
  await page.getByRole('cell',{name:'50%',exact:true}).waitFor();
  await page.getByRole('cell',{name:'2 / 3 · 66.7%',exact:true}).waitFor();
  const statsTable = page.getByRole('table');
  const fixedColor = await statsTable.getByText('Fixed', { exact: true }).evaluate(element => getComputedStyle(element.closest('.MuiChip-root')).backgroundColor);
  const subColor = await statsTable.getByText('Sub', { exact: true }).evaluate(element => getComputedStyle(element.closest('.MuiChip-root')).backgroundColor);
  assert.notEqual(fixedColor, subColor);
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption('summer');
  await page.getByRole('table', { name: 'Player statistics for season Summer 2025' }).waitFor();
  await tab('Matches');
  assert.equal(await page.getByRole('combobox', { name: 'Season', exact: true }).inputValue(), 'summer');
  await tab('Players');
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption(currentPeriod());
  await page.getByRole('table', { name: `Player statistics for season ${periodTitle(2025, currentPeriod())}` }).waitFor();
  await tab('Access');
  await page.getByRole('button', { name: 'Add administrator', exact: true }).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  await tab('Game days');
  assert.equal(await page.getByRole('button', { name: 'Open day', exact: true }).count(), 5);
  assert.equal(await page.getByRole('combobox', { name: 'Team A name', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Open day', exact: true }).count(), 2);
  await page.getByRole('button', { name: 'Open day', exact: true }).first().click();
  const dayNav = page.getByRole('tablist', { name: 'Game day sections' });
  await page.getByRole('button', { name: 'View match', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Edit match', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Delete match', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Delete game day', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'View match', exact: true }).click();
  await page.getByRole('heading', { name: 'Top 3', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Edit match', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Delete match', exact: true }).count(), 0);
  await page.getByRole('button', { name: '← Back to matches', exact: true }).click();
  await page.getByRole('heading', { name: 'Finalized matches', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Close day', exact: true }).count(), 0);
  await dayNav.getByRole('tab', { name: 'Lineup', exact: true }).click();
  await page.getByRole('textbox', { name: 'Team A name', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Team A name', exact: true }).fill('Draft name');
  await dayNav.getByRole('tab', { name: 'Code & status', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Close day', exact: true }).isDisabled(), true);
  await dayNav.getByRole('tab', { name: 'Lineup', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Team A name', exact: true }).inputValue(), 'Draft name');
  await page.getByRole('button', { name: 'Back to game days', exact: true }).click();
  await page.getByRole('button', { name: 'Create game day', exact: true }).click();
  await page.getByRole('button', { name: 'Create day & code', exact: true }).waitFor();
  const slot = (team, position) => page.getByRole('combobox', { name: `Team ${team} · Player ${position}`, exact: true });
  const selectSlot = async (team, position, id) => {
    if (!id) {
      await slot(team, position).focus();
      await slot(team, position).press('Escape');
      await page.locator('.MuiAutocomplete-root').filter({ has: slot(team, position) }).getByRole('button', { name: 'Clear', exact: true }).click({ force: true });
      return;
    }
    const player = registryPlayers.find(player => player.id === id);
    await slot(team, position).fill(player.name);
    await page.getByRole('option').filter({ hasText: player.name }).click();
  };
  const isAvailable = async (team, position, id) => {
    const player = registryPlayers.find(player => player.id === id);
    await slot(team, position).fill(player.name);
    const available = await page.getByRole('option').filter({ hasText: player.name }).getAttribute('aria-disabled') !== 'true';
    await slot(team, position).press('Escape');
    await slot(team, position).blur();
    return available;
  };
  await selectSlot('A', 1, 'player-0');
  assert.equal(await slot('A', 1).inputValue(), 'Anderson · Fixed');
  assert.equal(await isAvailable('A', 1, 'player-0'), true);
  for (const team of ['A', 'B']) for (let position = 1; position <= 6; position++) {
    if (team !== 'A' || position !== 1) assert.equal(await isAvailable(team, position, 'player-0'), false, 'Assigned players show as disabled in every other slot');
  }
  await selectSlot('B', 1, 'player-1');
  assert.equal(await isAvailable('A', 2, 'player-1'), false);
  await selectSlot('A', 1, 'player-2');
  assert.equal(await isAvailable('B', 2, 'player-0'), true, 'Replacing a player releases their previous selection');
  assert.equal(await isAvailable('B', 2, 'player-2'), false);
  await selectSlot('A', 1, '');
  assert.equal(await isAvailable('B', 2, 'player-2'), true, 'Clearing a slot releases the player');
  await selectSlot('B', 2, 'player-0');
  assert.equal(await isAvailable('A', 1, 'player-0'), false, 'Exclusivity works when selecting from Team 2');
  await page.getByRole('button', { name: 'Cancel creation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search game days' }).fill('2026-11-08');
  assert.equal(await page.getByRole('button', { name: 'Open day', exact: true }).count(), 1);
  await page.getByRole('combobox', { name: 'Day status' }).selectOption('closed');
  await page.getByText('No game days match this search.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search game days' }).fill('');
  assert.equal(await page.getByRole('button', { name: 'Open day', exact: true }).count(), 1);
  await page.getByRole('combobox', { name: 'Day status' }).selectOption('all');
  await page.getByRole('button', { name: 'Create game day', exact: true }).click();
  await page.locator('input[type="date"]:visible').fill('2026-11-15');
  for (const [teamIndex, team] of ['A', 'B'].entries()) for (let position = 1; position <= 6; position++) await selectSlot(team, position, `player-${teamIndex*6+position-1}`);
  await page.getByRole('button', { name: 'Create day & code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Game-day code', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Game-day code', exact: true }).inputValue(), 'AB7K9');
  await page.getByRole('button', { name: 'Back to game days', exact: true }).click();
  await page.getByRole('button', { name: 'Edit day 2026-11-15', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit game day', exact: true }).waitFor();
  await page.locator('input[type="date"]:visible').fill('2026-11-08');
  await page.getByRole('textbox', { name: 'Reason for date change' }).fill('Reschedule');
  await page.getByRole('button', { name: 'Save game day', exact: true }).click();
  await page.getByText('A game day already exists on this date.', { exact: true }).waitFor();
  await page.locator('input[type="date"]:visible').fill('2026-11-16');
  await page.getByRole('button', { name: 'Save game day', exact: true }).click();
  await page.getByText('Game day updated.', { exact: true }).waitFor();
  await dayNav.getByRole('tab', { name: 'Lineup', exact: true }).click();
  assert.equal(await slot('A', 1).inputValue(), 'Anderson · Fixed');
  await page.getByRole('textbox', { name: 'Team A name', exact: true }).fill('Red team');
  await selectSlot('A', 1, 'player-12');
  await slot('B', 5).fill('Mejdi');
  await page.getByRole('option', { name: '＋ Add player…', exact: true }).click();
  let lineupAdd = page.getByRole('dialog', { name: 'Add player', exact: true });
  await lineupAdd.getByRole('textbox', { name: 'Player name', exact: true }).fill('Mejdi');
  await lineupAdd.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await slot('B', 5).inputValue(), 'Omer · Fixed', 'Cancel preserves the occupied slot');
  await slot('B', 5).fill('Mejdi');
  await page.getByRole('option', { name: '＋ Add player…', exact: true }).click();
  lineupAdd = page.getByRole('dialog', { name: 'Add player', exact: true });
  await lineupAdd.getByRole('textbox', { name: 'Player name', exact: true }).fill('Mejdi');
  await lineupAdd.getByRole('button', { name: 'Save player', exact: true }).click();
  await lineupAdd.waitFor({ state: 'hidden' });
  assert.equal(await slot('B', 5).inputValue(), 'Mejdi · Sub');
  await page.getByRole('textbox', { name: 'Reason for day change', exact: true }).fill('Adjust lineup');
  await page.getByRole('button', { name: 'Save lineup version', exact: true }).click();
  await page.getByText(/^Lineup saved\. The game-day code stays the same/).waitFor();
  assert.equal(await slot('A', 1).inputValue(), 'Dimitri · Fixed');
  assert.equal(await slot('B', 5).inputValue(), 'Mejdi · Sub', 'The substitute survives saving and refreshing the lineup');
  await page.screenshot({ path: 'artifacts/admin-navigation/lineup-replacement-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to game days', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search game days' }).fill('Red team');
  assert.equal(await page.getByRole('button', { name: 'Open day', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Open day', exact: true }).click();
  await page.getByRole('heading', { name: 'Finalized matches', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to game days', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Search game days' }).inputValue(), 'Red team');
  await page.getByRole('button', { name: 'Delete day 2026-11-16', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete game day 2026-11-16?', exact: true });
  assert.equal(await deletion.getByRole('button', { name: 'Delete day', exact: true }).isDisabled(), true);
  await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete day 2026-11-16', exact: true }).click();
  await deletion.getByRole('textbox', { name: 'Reason for deleting day' }).fill('Remove test day');
  await deletion.getByRole('button', { name: 'Delete day', exact: true }).click();
  await page.getByText('Game day deleted.', { exact: true }).waitFor();
  await page.getByText('No game days match this search.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search game days' }).fill('');
  await page.screenshot({ path: 'artifacts/admin-navigation/game-days-mobile.png', fullPage: true });

  await tab('Matches');
  await page.getByRole('heading', { name: 'Finalized matches', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Search matches' }).fill('Home 26');
  await page.getByText('1–1 of 1 matches', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit match', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Administrator tools', exact: true });
  await editor.getByRole('textbox', { name: 'Team 1 name', exact: true }).fill('Renamed team');
  await editor.getByRole('textbox', { name: /^Reason for correction/ }).fill('Fix team name');
  await editor.getByRole('button', { name: 'Review correction', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm correction', exact: true }).getByRole('button', { name: 'Save correction', exact: true }).click();
  await editor.getByText('Correction confirmed online as version 2. Results and statistics are updated.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close tools', exact: true }).click();
  await page.getByRole('button', { name: '← Back to matches', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search matches' }).fill('Renamed team');
  await page.getByText('1–1 of 1 matches', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Delete match', exact: true }).count(), 0);
  await page.getByRole('textbox', { name: 'Search matches' }).fill('');
  await page.getByRole('button', { name: 'Register historical match', exact: true }).click();
  const historical = page.getByRole('dialog', { name: 'Register historical match', exact: true });
  await historical.locator('input[type="date"]').fill('2026-11-03');
  const scores = [[19,25],[22,25],[16,25],[25,17],[25,17],[15,12]];
  for(let index=0;index<scores.length;index++) {
    if(index) await historical.getByRole('button',{name:'Add set',exact:true}).click();
    for(let team=0;team<2;team++) await historical.getByRole('spinbutton',{name:`Set ${index+1} · Team ${team+1}`,exact:true}).fill(String(scores[index][team]));
  }
  assert.equal(await historical.getByRole('combobox', {name:'Team 1 · Player 1',exact:true}).count(),0);
  await historical.getByRole('checkbox',{name:'Include player totals (optional)',exact:true}).check();
  const firstPlayer=historical.getByRole('combobox',{name:'Team 1 · Player 1',exact:true});
  assert.equal(await firstPlayer.evaluate(element=>element.tagName),'SELECT');
  assert.equal(await firstPlayer.locator('option').last().textContent(),'＋ Add player…');
  await firstPlayer.selectOption('__add_player__');
  let quickAdd=page.getByRole('dialog',{name:'Add player',exact:true});
  await quickAdd.getByRole('textbox',{name:'Player name',exact:true}).fill('Cancelled player');
  await quickAdd.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await firstPlayer.inputValue(),'');
  assert.equal(await historical.getByRole('spinbutton',{name:'Set 6 · Team 2',exact:true}).inputValue(),'12');
  assert.ok(!registryPlayers.some(p=>p.name==='Cancelled player'));
  const names = [['Omer','Filipe','JP','Dimitri','Kaue','Chicó'],['Anderson','Diogo','Phillip','Gaëtan','Jota','Carlos']];
  const totals = [[19,15,13,10,8,7],[19,19,16,15,6,5]];
  for(let team=0;team<2;team++) for(let position=0;position<6;position++) {
    const selector=historical.getByRole('combobox',{name:`Team ${team+1} · Player ${position+1}`,exact:true});
    const known=registryPlayers.find(p=>p.name===names[team][position]);
    if(known) await selector.selectOption(known.id);
    else {
      await selector.selectOption('__add_player__');
      quickAdd=page.getByRole('dialog',{name:'Add player',exact:true});
      // A duplicate is rejected in the shared player form without losing match scores.
      if(names[team][position]==='Filipe') {
        await quickAdd.getByRole('textbox',{name:'Player name',exact:true}).fill('Anderson');
        await quickAdd.getByRole('button',{name:'Save player',exact:true}).click();
        await quickAdd.getByText('A player with this name already exists in this group.',{exact:true}).waitFor();
      }
      await quickAdd.getByRole('textbox',{name:'Player name',exact:true}).fill(names[team][position]);
      assert.equal(await quickAdd.getByRole('combobox',{name:'Player category',exact:true}).inputValue(),'sub');
      await quickAdd.getByRole('button',{name:'Save player',exact:true}).click();
      await quickAdd.waitFor({state:'hidden'});
      assert.equal(await selector.inputValue(),registryPlayers.find(p=>p.name===names[team][position]).id);
      assert.equal(historicalMatches.size,0,'Creating a player must not submit the historical match');
      assert.equal(await historical.getByRole('spinbutton',{name:'Set 6 · Team 2',exact:true}).inputValue(),'12');
    }
    await historical.getByRole('spinbutton',{name:`Points · ${names[team][position]}`,exact:true}).fill(String(totals[team][position]));
  }
  assert.equal(await historical.getByRole('combobox',{name:'Team 1 · Player 2',exact:true}).locator('option').evaluateAll(options=>options.some(o=>o.textContent.startsWith('Omer'))),false);
  assert.equal(await historical.getByRole('combobox',{name:'Team 2 · Player 1',exact:true}).locator('option').evaluateAll(options=>options.some(o=>o.textContent.startsWith('Filipe'))),true);
  await historical.getByRole('spinbutton',{name:'Opponent errors · Team 1',exact:true}).fill('50');
  await historical.getByRole('spinbutton',{name:'Opponent errors · Team 2',exact:true}).fill('41');
  await historical.getByText('Winner: Team 2 · 0 × 3. 3 training sets.',{exact:true}).waitFor();
  await historical.getByRole('spinbutton',{name:'Points · Omer',exact:true}).fill('18');
  await historical.getByRole('button',{name:'Save historical match',exact:true}).click();
  await historical.getByText('Team A: player points plus opponent errors must equal 122.',{exact:true}).waitFor();
  await historical.getByRole('spinbutton',{name:'Points · Omer',exact:true}).fill('19');
  await historical.getByRole('button',{name:'Save historical match',exact:true}).click();
  await page.getByRole('heading',{name:'Team 1 0 × 3 Team 2',exact:true}).waitFor();
  await page.getByText('Match decided in set 3. The following 3 sets count only toward statistics.',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Set 4.*Training/}).click();
  await page.getByRole('region',{name:/Set 4.*Training/}).getByText('Only match totals were recorded. Player points per set are unavailable.',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/admin-navigation/historical-match-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Edit match',exact:true}).click();
  const historicalEdit=page.getByRole('dialog',{name:'Edit historical match',exact:true});
  await historicalEdit.getByRole('spinbutton',{name:'Points · Omer',exact:true}).fill('20');
  await historicalEdit.getByRole('spinbutton',{name:'Opponent errors · Team 1',exact:true}).fill('49');
  await historicalEdit.getByRole('textbox',{name:/Reason for historical record/}).fill('Correct historical total');
  await historicalEdit.getByRole('button',{name:'Add player · Team 2',exact:true}).click();
  await historicalEdit.getByRole('combobox',{name:'Team 2 · Player 7',exact:true}).selectOption(registryPlayers.find(p=>p.name==='Chicó').id);
  await historicalEdit.getByRole('spinbutton',{name:'Points · Chicó',exact:true}).last().fill('5');
  await historicalEdit.getByRole('spinbutton',{name:'Points · Carlos',exact:true}).fill('0');
  await historicalEdit.getByRole('button',{name:'Add player · Team 1',exact:true}).click();
  await historicalEdit.getByRole('combobox',{name:'Team 1 · Player 7',exact:true}).selectOption(registryPlayers.find(p=>p.name==='Carlos').id);
  await historicalEdit.getByRole('spinbutton',{name:'Points · Carlos',exact:true}).first().fill('0');
  await historicalEdit.getByLabel('Match team · Chicó · Team 1 points',{exact:true}).selectOption('B');
  await historicalEdit.getByLabel('Match team · Carlos · Team 2 points',{exact:true}).selectOption('A');
  await historicalEdit.getByRole('button',{name:'Save historical match',exact:true}).click();
  await page.getByRole('progressbar',{name:'Points for Chicó — Team 1',exact:true}).waitFor();
  await page.getByRole('progressbar',{name:'Points for Chicó — Team 2',exact:true}).waitFor();
  const swapped=[...historicalMatches.values()].find(m=>m.payload.player_totals_recorded===true).payload;
  assert.equal(swapped.players.filter(p=>p.name==='Chicó').reduce((sum,p)=>sum+p.points,0),12);
  assert.ok(swapped.players.filter(p=>p.name==='Chicó').every(p=>p.result_team==='B'));

  await page.getByRole('progressbar',{name:'Points for Omer — Team 1',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Points for Omer — Team 1"]')?.getAttribute('aria-valuetext')==='20 points');
  assert.equal(await page.getByRole('button',{name:'Delete match',exact:true}).count(), 0);
  await page.getByRole('button',{name:'← Back to matches',exact:true}).click();
  await page.getByRole('button',{name:'Register historical match',exact:true}).click();
  const scoresOnly=page.getByRole('dialog',{name:'Register historical match',exact:true});
  await scoresOnly.locator('input[type="date"]').fill('2026-11-03');
  for(let index=0;index<scores.length;index++) {
    if(index) await scoresOnly.getByRole('button',{name:'Add set',exact:true}).click();
    for(let team=0;team<2;team++) await scoresOnly.getByRole('spinbutton',{name:`Set ${index+1} · Team ${team+1}`,exact:true}).fill(String(scores[index][team]));
  }
  await scoresOnly.getByRole('button',{name:'Save historical match',exact:true}).click();
  await page.getByRole('heading',{name:'Team 1 0 × 3 Team 2',exact:true}).waitFor();
  await page.getByText('Player totals were not recorded.',{exact:true}).waitFor();
  const submitted=[...historicalMatches.values()].find(m=>m.payload.player_totals_recorded===false).payload;
  assert.deepEqual(submitted.players,[]);assert.equal(submitted.errors_a,null);assert.equal(submitted.errors_b,null);
  assert.equal(await page.getByRole('heading',{name:'Top 3',exact:true}).count(),0);
  await page.getByRole('button',{name:'Edit match',exact:true}).click();
  const scoresEdit=page.getByRole('dialog',{name:'Edit historical match',exact:true});
  assert.equal(await scoresEdit.getByRole('checkbox',{name:'Include player totals (optional)',exact:true}).isChecked(),false);
  await scoresEdit.getByRole('checkbox',{name:'Include player totals (optional)',exact:true}).check();
  await scoresEdit.getByRole('combobox',{name:'Team 1 · Player 1',exact:true}).waitFor();
  await scoresEdit.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.screenshot({path:'artifacts/admin-navigation/historical-scores-only-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button', { name: '← Back to matches', exact: true }).click();
  await page.getByRole('button', { name: 'Register historical match', exact: true }).click();
  const drawForm = page.getByRole('dialog', { name: 'Register historical match', exact: true });
  await drawForm.locator('input[type="date"]').fill('2026-10-23');
  const drawScores = [[24,26],[25,20],[25,22],[22,21]];
  for (let index = 0; index < drawScores.length; index++) {
    if (index) await drawForm.getByRole('button', { name: 'Add set', exact: true }).click();
    for (let team = 0; team < 2; team++) await drawForm.getByRole('spinbutton', { name: `Set ${index+1} · Team ${team+1}`, exact: true }).fill(String(drawScores[index][team]));
  }
  await drawForm.getByRole('checkbox', { name: 'Ended early', exact: true }).nth(3).check();
  await drawForm.getByRole('checkbox', { name: 'Finish as draw', exact: true }).check();
  await drawForm.getByText('Draw · 2 × 1. Scores and points are preserved; no individual wins are awarded.', { exact: true }).waitFor();
  await drawForm.getByRole('button', { name: 'Save historical match', exact: true }).click();
  await page.getByRole('heading', { name: 'Team 1 2 × 1 Team 2', exact: true }).waitFor();
  await page.getByText('Draw · match ended early', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit match', exact: true }).click();
  const drawEdit = page.getByRole('dialog', { name: 'Edit historical match', exact: true });
  assert.equal(await drawEdit.getByRole('checkbox', { name: 'Finish as draw', exact: true }).isChecked(), true);
  assert.equal(await drawEdit.getByRole('spinbutton', { name: 'Set 4 · Team 2', exact: true }).inputValue(), '21');
  await drawEdit.getByRole('spinbutton', { name: 'Set 4 · Team 2', exact: true }).fill('22');
  await drawEdit.getByRole('textbox', { name: 'Reason for historical record', exact: true }).fill('Correct interrupted set score');
  await drawEdit.getByRole('button', { name: 'Save historical match', exact: true }).click();
  await page.getByText('Draw · match ended early', { exact: true }).waitFor();
  const drawn = [...historicalMatches.values()].find(match => match.payload.ended_as_draw);
  assert.equal(drawn.payload.sets[3].score_a,22); assert.equal(drawn.payload.sets[3].score_b,22);

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mkdir('artifacts/admin-navigation', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-navigation/matches-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await workspace.waitFor({ state: 'visible' });
  const sidebarBounds = await workspace.boundingBox();
  const sectionBounds = await nav.boundingBox();
  assert.ok(sidebarBounds.x + sidebarBounds.width <= sectionBounds.x, 'Workspace navigation stays beside group content');
  const workspaceBounds = await page.locator('aside').boundingBox();
  assert.ok(Math.abs(workspaceBounds.y - sectionBounds.y) < 2, 'Group tabs align with the top of the workspace');
  await page.evaluate(() => window.scrollTo(0, 350));
  assert.ok(Math.abs((await nav.boundingBox()).y) < 2, 'Primary tabs remain at the top while scrolling');
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const titleBounds = await page.getByRole('heading', { name: group.name, exact: true }).boundingBox();
  const publicLinkBounds = await page.getByRole('link', { name: 'Public group page', exact: true }).boundingBox();
  assert.ok(publicLinkBounds.x > titleBounds.x + titleBounds.width, 'Public link sits to the right of the group title');
  assert.ok(Math.abs(publicLinkBounds.y + publicLinkBounds.height / 2 - titleBounds.y - titleBounds.height / 2) < 16, 'Public link aligns with the title row');
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.screenshot({ path: 'artifacts/admin-navigation/matches-desktop.png', fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  assert.equal(new URL(page.url()).hash, '#/admin');
  await account.click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  console.log('PASS: admin sections, shared results, statistics, pagination, season retention, player CRUD/categories/search, finalized match edit/search and deletion protection, access, game-day CRUD/search/status filters, preserved lineup drafts and responsive layout.');
} finally { await browser.close(); }
