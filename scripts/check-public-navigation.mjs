import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Public navigation test', time_zone: 'America/Toronto' };
const matchId = '22222222-2222-4222-8222-222222222222';
const players = [{ id: 'player-a', name: 'Alex', points: 20, matches: 4, wins: 2, days: 2 }];
let requests = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const args = request.postDataJSON(); const name = url.pathname.split('/').at(-1);
    if (name === 'public_group_summary') {
      requests++;
      return route.fulfill({ headers, json: { group, season: args.p_season ?? 2026, page: args.p_page, page_size: 25,
        seasons: [2026,2025], match_count: 26, participant_count: 1, point_count: 20, fallback_dates: 0, players,
        matches: [{ id: matchId, started_at: '2025-11-07T23:00:00Z', closed_at: '2025-11-08T01:00:00Z',
          team_a_name: 'Home', team_b_name: 'Away', sets_a: 1, sets_b: 0, sets: [{ score_a: 25, score_b: 20 }] }] } });
    }
    if (name === 'public_match_details') return route.fulfill({ headers, json: { group, group_id: group.id, id: args.p_match_id,
      started_at: '2025-11-07T23:00:00Z', closed_at: '2025-11-08T01:00:00Z', team_a_name: 'Home', team_b_name: 'Away', sets_a: 1, sets_b: 0, sets: [] } });
    throw new Error(`Unexpected external request: ${name}`);
  });
  const nav = () => page.getByRole('tablist', { name: 'Group sections' });
  const selected = async label => assert.equal(await nav().getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected'), 'true');
  await page.goto(`${baseUrl}/#/groups/${group.id}`);
  await page.getByRole('heading', { name: 'Season overview · 2026', exact: true }).waitFor();
  await selected('Overview');
  assert.equal(await page.getByRole('table').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(), 0);
  const initialRequests = requests;
  await nav().getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('table', { name: 'Player statistics for season 2026' }).waitFor();
  await selected('Players'); assert.equal(requests, initialRequests);
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(), 0);
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption('2025');
  await page.getByRole('table', { name: 'Player statistics for season 2025' }).waitFor(); await selected('Players');
  await nav().getByRole('tab', { name: 'Matches', exact: true }).click();
  await page.getByRole('heading', { name: 'Matches · 2025', exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.getByRole('table').count(), 0);
  await page.getByRole('link', { name: 'Next', exact: true }).click();
  await page.getByText('Page 2 of 2', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'View match', exact: true }).click();
  await page.getByRole('heading', { name: 'Sets & players', exact: true }).waitFor();
  await page.getByRole('link', { name: '← Back to matches', exact: true }).click();
  await page.getByText('Page 2 of 2', { exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.getByRole('combobox', { name: 'Season', exact: true }).inputValue(), '2025');
  await page.reload(); await page.getByText('Page 2 of 2', { exact: true }).waitFor(); await selected('Matches');
  await nav().getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Season overview · 2025', exact: true }).waitFor();
  await page.goBack(); await page.getByText('Page 2 of 2', { exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mkdir('artifacts/public-navigation', { recursive: true });
  await page.screenshot({ path: 'artifacts/public-navigation/matches-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: separate group sections, season selection, match pagination, detail return, reload, browser back and mobile layout.');
} finally { await browser.close(); }
