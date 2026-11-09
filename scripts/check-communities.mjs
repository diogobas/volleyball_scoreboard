import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const community = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_id: 'C-1', name: 'Montreal Volleyball Community', region: 'Montreal' };
const groups = [
  { id: '11111111-1111-4111-8111-111111111111', display_id: 'G-1', name: 'Tuesday Montreal', community_id: community.id, community, time_zone: 'America/Toronto' },
  { id: '22222222-2222-4222-8222-222222222222', display_id: 'G-2', name: 'Thursday Montreal', community_id: community.id, community, time_zone: 'America/Toronto' },
];
const registries = new Map(groups.map(group => [group.id, []]));
const sourcePerson = { id: '33333333-3333-4333-8333-333333333333', name: 'Alex Montreal', sex: 'male', preferred_positions: ['MB', 'O'], community_person_id: '44444444-4444-4444-8444-444444444444', category: 'fixed', version: 1 };
registries.set(groups[0].id, [sourcePerson]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('artifacts/communities', { recursive: true });
  const errors = [], calls = [];
  async function newPage(role) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    const user = { id: role === 'owner' ? '55555555-5555-4555-8555-555555555555' : '66666666-6666-4666-8666-666666666666', email: role === 'owner' ? 'diogovvb@gmail.com' : 'group@example.test', aud: 'authenticated', role: 'authenticated' };
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const name = url.pathname.split('/').at(-1), args = request.postDataJSON(); calls.push({ role, name, args });
      let json;
      if (name === 'token') json = { access_token: 'mock-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user };
      else if (name === 'user') json = user;
      else if (name === 'list_my_communities') json = role === 'owner' ? [community] : [];
      else if (name === 'list_my_groups') json = role === 'owner' ? groups : [groups[0]];
      else if (name === 'list_community_admins') json = [{ user_id: user.id, email: user.email }];
      else if (name === 'list_group_admins') json = [{ user_id: user.id, email: user.email }];
      else if (name === 'get_group_registry') json = { group: groups.find(g => g.id === args.p_group_id), players: registries.get(args.p_group_id), deleted_player_ids: [] };
      else if (name === 'list_game_days') json = [];
      else if (name === 'public_group_info') json = groups.find(g => g.id === args.p_group_ref || g.display_id === args.p_group_ref);
      else if (name === 'public_community') {
        assert.equal(args.p_community_ref, 'C-1'); json = { community, groups };
      }
      else if (name === 'public_group_period_summary') json = { group: groups.find(g => g.id === args.p_group_id), season: args.p_season ?? 2026, period: args.p_period, page: args.p_page, page_size: 25, seasons: [2026], players: [], matches: [], match_count: 0, participant_count: 0, point_count: 0 };
      else if (name === 'create_community_group') {
        assert.equal(role, 'owner'); assert.equal(args.p_community_id, community.id);
        json = { id: '77777777-7777-4777-8777-777777777777', display_id: 'G-3', name: args.p_name, community_id: community.id, community, time_zone: 'America/Toronto' };
        groups.push(json); registries.set(json.id, []);
      }
      else if (name === 'list_community_players') {
        assert.equal(role, 'owner'); assert.equal(args.p_community_id, community.id);
        json = { total: 1, page: 1, page_size: 25, players: [{ id: sourcePerson.community_person_id, name: sourcePerson.name, groups: [{ id: groups[0].id, name: groups[0].name }] }] };
      }
      else if (name === 'import_community_players') {
        assert.equal(role, 'owner'); assert.deepEqual(args.p_person_ids, [sourcePerson.community_person_id]);
        registries.set(args.p_group_id, [{ ...sourcePerson, id: '88888888-8888-4888-8888-888888888888', category: args.p_category }]); json = { added: 1 };
      }
      else throw new Error(`Unexpected external request: ${name}`);
      return route.fulfill({ headers, json });
    });
    return { page, user };
  }
  const { page, user } = await newPage('owner');
  await page.goto(`${baseUrl}/#/groups`);
  await page.getByRole('heading', { name: 'Community results', exact: true }).waitFor();
  assert.equal(calls.length, 0, 'Public landing must not fetch global data');
  assert.equal(await page.getByText(community.name, { exact: true }).count(), 0);
  await page.goto(`${baseUrl}/#/communities/C-1`);
  await page.getByRole('heading', { name: community.name, exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tuesday Montreal', exact: true }).count(), 1);
  await page.getByRole('link', { name: 'View Tuesday Montreal', exact: true }).click();
  await page.getByRole('heading', { name: 'Tuesday Montreal', exact: true }).waitFor();
  await page.getByRole('link', { name: `← ${community.name}`, exact: true }).click();
  await page.getByRole('heading', { name: community.name, exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/communities/public-community-mobile.png', fullPage: true });
  await page.goto(`${baseUrl}/#/admin`);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await page.locator('input[type="password"]').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const workspace = page.getByRole('tablist', { name: 'Workspace sections' });
  await page.getByRole('button', { name: 'Administration · My groups', exact: true }).click();
  await workspace.getByRole('tab', { name: 'My communities', exact: true }).click();
  await page.getByRole('button', { name: 'Manage community', exact: true }).click();
  const communityNav = page.getByRole('tablist', { name: 'Community sections' });
  await page.evaluate(() => window.scrollTo(0, 0));
  const communityNavTop = (await communityNav.boundingBox()).y;
  await page.getByRole('tablist', { name: 'Community sections' }).getByRole('tab', { name: 'Community access', exact: true }).click();
  await page.getByRole('heading', { name: 'Community administrators', exact: true }).waitFor();
  await page.getByText('diogovvb@gmail.com (you)', { exact: true }).waitFor();
  await page.getByRole('tablist', { name: 'Community sections' }).getByRole('tab', { name: 'Groups', exact: true }).click();
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create group', exact: true });
  assert.equal(await create.getByRole('combobox', { name: 'Community', exact: true }).inputValue(), community.id);
  await create.getByRole('textbox', { name: 'Group name', exact: true }).fill('New Montreal group');
  await create.getByRole('button', { name: 'Create group', exact: true }).click();
  await page.getByRole('heading', { name: 'New Montreal group', exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  const groupNavTop = (await page.getByRole('tablist', { name: 'Administration sections' }).boundingBox()).y;
  assert.ok(Math.abs(groupNavTop - communityNavTop) < 2, 'Community and nested group tabs share the same position');
  assert.equal(await communityNav.count(), 0, 'Only the active context has a primary tab bar');
  await page.getByRole('tablist', { name: 'Administration sections' }).getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: 'Add from community', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add players from community', exact: true });
  await picker.getByRole('textbox', { name: 'Search community players', exact: true }).fill('Alex');
  await picker.getByRole('checkbox', { name: sourcePerson.name, exact: true }).check();
  await picker.getByRole('combobox', { name: 'Category in this group', exact: true }).selectOption('sub');
  await picker.getByRole('button', { name: 'Add selected players (1)', exact: true }).click();
  await page.getByText('Community players added.', { exact: true }).waitFor();
  await page.getByRole('link', { name: `View profile for ${sourcePerson.name}`, exact: true }).waitFor();
  assert.equal(registries.get(groups[0].id)[0].category, 'fixed');
  assert.equal(registries.get(groups.at(-1).id)[0].category, 'sub');
  assert.equal(registries.get(groups.at(-1).id)[0].sex, 'male');
  assert.deepEqual(registries.get(groups.at(-1).id)[0].preferred_positions, ['MB', 'O']);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/communities/community-player-import-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to my groups', exact: true }).click();
  await communityNav.waitFor();
  await page.getByRole('button', { name: 'Back to my communities', exact: true }).waitFor();
  const regular = await newPage('group');
  await regular.page.goto(`${baseUrl}/#/admin`);
  await regular.page.getByRole('textbox', { name: 'Email', exact: true }).fill(regular.user.email);
  await regular.page.locator('input[type="password"]').fill('test-password');
  await regular.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await regular.page.getByRole('heading', { name: 'My groups', exact: true }).waitFor();
  await regular.page.getByRole('button', { name: 'Manage group', exact: true }).waitFor();
  assert.equal(await regular.page.getByRole('button', { name: 'Manage group', exact: true }).count(), 1);
  assert.equal(await regular.page.getByText('Thursday Montreal', { exact: true }).count(), 0);
  await regular.page.getByRole('button', { name: 'Manage group', exact: true }).click();
  await regular.page.getByRole('tablist', { name: 'Administration sections' }).getByRole('tab', { name: 'Players', exact: true }).click();
  await regular.page.getByRole('link', { name: `View profile for ${sourcePerson.name}`, exact: true }).waitFor();
  assert.equal(await regular.page.getByRole('button', { name: 'Add from community', exact: true }).count(), 0);
  await regular.page.getByRole('button', { name: 'Administration · My groups', exact: true }).click();
  await regular.page.getByRole('tablist', { name: 'Workspace sections' }).getByRole('tab', { name: 'My communities', exact: true }).click();
  await regular.page.getByText('You do not administer a community yet.', { exact: true }).waitFor();
  assert.equal(await regular.page.getByRole('button', { name: 'Manage community', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(!calls.some(call => ['groups', 'communities', 'players'].includes(call.name)), 'No global table queries');
  console.log('PASS: private directory, scoped public community/group links, community access, group creation, player reuse and restricted group administration.');
} finally { await browser.close(); }
