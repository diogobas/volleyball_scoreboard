import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const appUrl = process.env.APP_BASE_URL ?? 'http://127.0.0.1:5199';
const publicUrl = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:5200';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

const openContext = async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
};

try {
  await mkdir('artifacts/build-browser', { recursive: true });
  const app = await openContext();
  const requests = [];
  app.page.on('request', (request) => requests.push(request.url()));
  await app.page.goto(appUrl);
  await app.page.getByText('Saved on this device', { exact: true }).waitFor();
  assert.ok(
    !requests.some((url) => /\/(AdministrationPage|PublicResultsPage)-[^/]+\.js/.test(url)),
  );
  await app.page.screenshot({ path: 'artifacts/build-browser/app-entry.png' });
  await app.page.goto(`${appUrl}/#/admin`);
  await app.page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  assert.ok(requests.some((url) => /\/AdministrationPage-[^/]+\.js/.test(url)));
  await app.context.close();

  const publicSite = await openContext();
  await publicSite.page.goto(publicUrl);
  await publicSite.page.getByRole('heading', { name: 'Community results', exact: true }).waitFor();
  assert.equal((await publicSite.page.evaluate(() => indexedDB.databases())).length, 0);
  await publicSite.page.screenshot({ path: 'artifacts/build-browser/public-entry.png' });
  await publicSite.page.goto(`${publicUrl}/#/admin`);
  await publicSite.page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  assert.equal((await publicSite.page.evaluate(() => indexedDB.databases())).length, 0);
  await publicSite.page.goto(`${publicUrl}/#/app`);
  await publicSite.page.getByText('Saved on this device', { exact: true }).waitFor();
  assert.ok((await publicSite.page.evaluate(() => indexedDB.databases())).length > 0);
  await publicSite.context.close();

  const failedPage = await openContext();
  await failedPage.page.route('**/PublicResultsPage-*.js', (route) => route.abort());
  await failedPage.page.goto(`${appUrl}/#/groups`);
  await failedPage.page
    .getByText('Public results could not be loaded. Reconnect and reload this page.', {
      exact: true,
    })
    .waitFor();
  await failedPage.page.getByRole('button', { name: 'Reload', exact: true }).waitFor();
  await failedPage.page.screenshot({ path: 'artifacts/build-browser/public-load-failure.png' });
  await failedPage.page.getByRole('link', { name: 'Open scoreboard', exact: true }).click();
  await failedPage.page.getByText('Saved on this device', { exact: true }).waitFor();
  await failedPage.context.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: compiled app/public entrypoints, lazy administration, isolated scoreboard storage and public-chunk failure recovery.',
  );
} finally {
  await browser.close();
}
