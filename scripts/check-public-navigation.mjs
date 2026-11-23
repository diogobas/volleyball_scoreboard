import { currentPeriod, periodTitle } from '../src/game/seasonPeriods';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Public navigation test', display_id: 'G-1', time_zone: 'America/Toronto' };
const allMatches = Array.from({ length: 26 }, (_, i) => ({
  id: `22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,
  started_at: '2025-11-07T23:00:00Z', closed_at: '2025-11-08T01:00:00Z',
  team_a_name: `Home ${i+1}`, team_b_name: 'Away', sets_a: 1, sets_b: 0, sets: [{ score_a: 25, score_b: 20 }],
}));
const players = [{ id: '33333333-3333-4333-8333-333333333333', display_id: 'P-1', name: 'Alex', points: 20, matches: 4, wins: 2, days: 2 }];
let requests = 0;
let failScorers = true;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('artifacts/public-navigation', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const args = request.postDataJSON(); const name = url.pathname.split('/').at(-1);
    if (name === 'public_group_info') return route.fulfill({ headers, json: { id: group.id } });
    if (name === 'public_group_period_summary') {
      requests++;
      const matches = args.p_season === 2024 ? [] : allMatches;
      return route.fulfill({ headers, json: { group, period: args.p_period, season: args.p_season ?? 2026, page: args.p_page, page_size: 25,
        seasons: [2026,2025,2024], match_count: matches.length, participant_count: 1, attendance_day_count: 3, point_count: 20, fallback_dates: 0, players,
        matches: matches.slice((args.p_page-1)*25,args.p_page*25) } });
    }
    if (name === 'public_player_profile') {
      assert.equal(args.p_player_ref, 'P-1');
      const matches = args.p_period === 'summer' ? [] : allMatches;
      return route.fulfill({ headers, json: { group, player: { id: players[0].id, display_id: 'P-1', name: 'Alex', category: 'fixed', sex: 'female', preferred_positions: ['S', 'OH'], removed: false },
        season: args.p_season ?? 2026, period: args.p_period, seasons: [2026, 2025], page: args.p_page, page_size: args.p_page_size,
        statistics: { points: matches.length ? 20 : 0, matches: matches.length, wins: matches.length ? 2 : 0, days: matches.length ? 2 : 0, attendance_day_count: matches.length ? 3 : 0 },
        match_count: matches.length, matches: matches.slice((args.p_page - 1) * args.p_page_size, args.p_page * args.p_page_size).map(match => ({ ...match, player_points: 3, player_teams: ['A'], player_result: 'win' })) } });
    }
    if (name === 'public_match_details') {
      if (args.p_match_id === allMatches[0].id && failScorers) {
        return route.fulfill({ status: 500, headers, json: { message: 'Temporary failure' } });
      }
      let sets = [
        { number: 1, team_a_name: 'Home', team_b_name: 'Away', score_a: 4, score_b: 2, errors_a: 1, errors_b: 0,
          players: [{id:'alex',name:'Alex',team:'A',position:1,points:3}, {id:'bob',name:'Bob',team:'A',position:2,points:0}, {id:'chris',name:'Chris',team:'B',position:1,points:2}] },
      ];
      if (args.p_match_id === allMatches[0].id) sets = [...sets,
        { number: 2, team_a_name: 'Home', team_b_name: 'Away', score_a: 108, score_b: 4, errors_a: 100, errors_b: 0,
          players: [{id:'alex',name:'Alex',team:'A',position:1,points:4}, {id:'dani',name:'Dani',team:'A',position:2,points:4},
            {id:'chris',name:'Chris',team:'B',position:1,points:3}, {id:'eve',name:'Eve',team:'B',position:2,points:1}] },
      ];
      if (args.p_match_id === allMatches[1].id) sets = [{ ...sets[0], score_a: 25, score_b: 0, errors_a: 25, errors_b: 0, players: [] }];
      return route.fulfill({ headers, json: { group, group_id: group.id, id: args.p_match_id,
      started_at: '2025-11-07T23:00:00Z', closed_at: '2025-11-08T01:00:00Z', team_a_name: 'Home', team_b_name: 'Away', sets_a: 1, sets_b: 0, sets } });
    }
    throw new Error(`Unexpected external request: ${name}`);
  });
  const nav = () => page.getByRole('tablist', { name: 'Group sections' });
  const selected = async label => assert.equal(await nav().getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected'), 'true');
  await page.goto(`${baseUrl}/#/groups/${group.display_id}`);
  await page.getByRole('heading', { name: `Season overview · ${periodTitle(2026, currentPeriod())}`, exact: true }).waitFor();
  await selected('Overview');
  assert.equal(await page.getByRole('table').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(), 0);
  const initialRequests = requests;
  await page.getByRole('link', { name: 'View matches', exact: true }).click();
  await page.getByRole('heading', { name: `Matches · ${periodTitle(2026, currentPeriod())}`, exact: true }).waitFor(); await selected('Matches');
  assert.equal(requests, initialRequests);
  const firstCard = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Home 1 1 × 0 Away', exact: true }) });
  await firstCard.getByRole('button', { name: 'Retry scorers', exact: true }).waitFor();
  failScorers = false;
  await firstCard.getByRole('button', { name: 'Retry scorers', exact: true }).click();
  const firstScorers = firstCard.getByRole('list', { name: 'Top scorers for Home 1 vs Away', exact: true });
  await firstScorers.waitFor();
  assert.equal(await firstScorers.getByRole('listitem').count(), 3);
  const scorerRows = await firstScorers.getByRole('listitem').allTextContents();
  assert.match(scorerRows[0], /Alex.*7 pts/);
  assert.match(scorerRows[1], /Chris.*5 pts/);
  assert.match(scorerRows[2], /Dani.*4 pts/);
  assert.doesNotMatch(scorerRows.join(' '), /Bob|Eve|error/i);
  const secondCard = page.locator('.MuiPaper-root').filter({ has: page.getByRole('heading', { name: 'Home 2 1 × 0 Away', exact: true }) });
  await secondCard.getByText('No player points recorded.', { exact: true }).waitFor();
  const thirdScorers = page.getByRole('list', { name: 'Top scorers for Home 3 vs Away', exact: true });
  await thirdScorers.waitFor();
  assert.match((await thirdScorers.getByRole('listitem').allTextContents())[0], /Alex.*3 pts/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/public-navigation/match-card-scorers-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const summaryBounds = await firstCard.getByRole('heading', { level: 3 }).boundingBox();
  const scorerBounds = await firstScorers.boundingBox();
  assert.ok(scorerBounds.x > summaryBounds.x + summaryBounds.width, 'Desktop scorers should occupy the right side of the card');
  const cardBounds = await firstCard.boundingBox();
  assert.ok(cardBounds.height < 240, 'Desktop match card should stay compact');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/public-navigation/match-card-scorers-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await nav().getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('link', { name: 'View players', exact: true }).click();
  await page.getByRole('table', { name: `Player statistics for season ${periodTitle(2026, currentPeriod())}` }).waitFor();
  await page.getByRole('columnheader',{name:'Win rate',exact:true}).waitFor();
  await page.getByRole('cell',{name:'50%',exact:true}).waitFor();
  await page.getByRole('cell',{name:'2 / 3 · 66.7%',exact:true}).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path:'artifacts/public-navigation/player-rates-mobile.png',fullPage:true});
  await selected('Players'); assert.equal(requests, initialRequests);
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(), 0);
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2025');
  await page.getByRole('table', { name: `Player statistics for season ${periodTitle(2025, currentPeriod())}` }).waitFor(); await selected('Players');
  await page.getByRole('table').getByRole('link', { name: 'Alex', exact: true }).click();
  await page.getByRole('heading', { name: 'Alex', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Edit player', exact: true }).count(), 0);
  await page.getByText('Female', { exact: true }).waitFor();
  await page.getByText('Setter (S)', { exact: true }).waitFor();
  await page.getByText('Opposite Hitter (OH)', { exact: true }).waitFor();
  await page.getByRole('heading', { name: `Statistics · ${periodTitle(2025, currentPeriod())}`, exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Match history', exact: true }).waitFor();
  await page.getByText('2 / 3 · 66.7%', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(), 5);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/public-navigation/player-profile-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/public-navigation/player-profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2026');
  await page.getByRole('heading', { name: `Statistics · ${periodTitle(2026, currentPeriod())}`, exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption('summer');
  await page.getByRole('heading', { name: 'Statistics · Summer 2026', exact: true }).waitFor();
  await page.getByText('No recorded participation in this period.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption(currentPeriod());
  await page.getByRole('heading', { name: `Statistics · ${periodTitle(2026, currentPeriod())}`, exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2025');
  await page.getByRole('heading', { name: `Statistics · ${periodTitle(2025, currentPeriod())}`, exact: true }).waitFor();
  await page.getByRole('link', { name: '← Back to players', exact: true }).click();
  await page.getByRole('table', { name: `Player statistics for season ${periodTitle(2025, currentPeriod())}` }).waitFor(); await selected('Players');

  await nav().getByRole('tab', { name: 'Matches', exact: true }).click();
  await page.getByRole('heading', { name: `Matches · ${periodTitle(2025, currentPeriod())}`, exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.getByRole('table').count(), 0);
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'View match', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Top 3', exact: true }).waitFor();
  assert.equal(await page.getByRole('link',{name:'Review in Administration',exact:true}).count(),0);
  assert.equal(await page.getByRole('progressbar',{name:'Points for Alex — Home',exact:true}).getAttribute('aria-valuetext'),'3 points');
  assert.equal(await page.getByRole('progressbar',{name:'Points for Bob — Home',exact:true}).getAttribute('aria-valuenow'),'0');
  assert.equal(await page.getByRole('progressbar',{name:'Points for Opponent’s error — Home',exact:true}).getAttribute('aria-valuetext'),'1 points');
  const podium=page.getByRole('list',{name:'Top 3 players',exact:true});
  assert.equal(await podium.getByRole('listitem').count(),2);
  assert.equal(await podium.getByText('Alex',{exact:true}).count(),1);
  await page.getByRole('button',{name:/Set 1.*Home 4 × 2 Away/}).click();
  await page.getByRole('heading',{name:'Player ranking · Set 1',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/public-navigation/match-statistics-mobile.png',fullPage:true});
  await page.getByRole('link', { name: '← Back to matches', exact: true }).click();
  await page.getByText('Page 2 of 6', { exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.getByRole('combobox', { name: 'Year', exact: true }).inputValue(), '2025');
  await page.reload(); await page.getByText('Page 2 of 6', { exact: true }).waitFor(); await selected('Matches');
  await nav().getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: `Season overview · ${periodTitle(2025, currentPeriod())}`, exact: true }).waitFor();
  await page.goBack(); await page.getByText('Page 2 of 6', { exact: true }).waitFor(); await selected('Matches');
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),5);
  await page.getByRole('combobox', { name: 'Matches per page', exact: true }).selectOption('10');
  await page.getByText('Page 1 of 3', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),10);
  await page.getByRole('link', { name: 'Go to page 3', exact: true }).click();
  await page.getByText('Page 3 of 3', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),6);
  await page.getByRole('link', { name: 'View match', exact: true }).first().click();
  await page.getByRole('link', { name: '← Back to matches', exact: true }).click();
  await page.getByText('Page 3 of 3', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Matches per page', exact: true }).inputValue(),'10');
  await page.getByRole('combobox', { name: 'Matches per page', exact: true }).selectOption('25');
  await page.getByText('Page 1 of 2', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),25);
  await page.getByRole('link', { name: 'Go to next page', exact: true }).click();
  await page.getByText('Page 2 of 2', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),1);
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2024');
  await page.getByText('Page 1 of 1', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View match', exact: true }).count(),0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mkdir('artifacts/public-navigation', { recursive: true });
  await page.screenshot({ path: 'artifacts/public-navigation/matches-mobile.png', fullPage: true });

  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption('summer');
  await page.getByRole('heading', { name: 'Matches · Summer 2024', exact: true }).waitFor();
  assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('period'), 'summer');
  await page.reload();
  await page.getByRole('heading', { name: 'Matches · Summer 2024', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Season', exact: true }).inputValue(), 'summer');
  await page.getByRole('combobox', { name: 'Season', exact: true }).selectOption('all');
  await page.getByRole('heading', { name: 'Matches · 2024', exact: true }).waitFor();

  await page.getByRole('link',{name:'Privacy policy',exact:true}).click();
  await page.getByRole('heading',{name:'Privacy Policy',exact:true}).waitFor();
  await page.getByRole('heading',{name:'6. Contact and privacy requests',exact:true}).waitFor();
  assert.ok(await page.getByRole('link',{name:'diogovvb@gmail.com',exact:true}).count());
  assert.equal(new URL(page.url()).pathname,'/privacy.html');
  assert.deepEqual(errors, []);
  console.log('PASS: per-match top scorers, error exclusion, empty ranking, retry, separate group sections, pagination, match statistics and mobile layout.');
} finally { await browser.close(); }
