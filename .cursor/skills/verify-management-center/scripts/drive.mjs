#!/usr/bin/env node
// Drives the Management Center UI in headless Chrome via playwright-core.
// Invoke through `mc.sh drive <feature>`; env: MC_URL, MC_KEY, MC_OUT (set by mc.sh).
// Features: login | fleet-overview | fleet-create-key | nav-smoke
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const { MC_URL, MC_KEY, MC_OUT } = process.env;
const feature = process.argv[2];
const exe = process.env.MC_CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const steps = [];
let page;

async function shot(name) {
  await page.screenshot({ path: `${MC_OUT}/${name}.png`, fullPage: true });
  fs.writeFileSync(`${MC_OUT}/${name}.aria.txt`, await page.locator('body').ariaSnapshot());
  log(`captured ${name}.png + ${name}.aria.txt`);
}
async function check(desc, fn) {
  try { await fn(); steps.push({ step: desc, ok: true }); log(`PASS ${desc}`); }
  catch (e) { steps.push({ step: desc, ok: false, error: String(e).split('\n')[0] }); log(`FAIL ${desc}: ${e}`); throw e; }
}
async function login() {
  await page.goto(`${MC_URL}/management.html`);
  await check('login page shows key field', () => page.getByPlaceholder('Enter the management key').waitFor());
  await shot('01-login');
  await page.getByPlaceholder('Enter the management key').fill(MC_KEY);
  await page.getByRole('button', { name: 'Open console' }).click();
  await check('lands on Fleet overview', () => page.getByRole('heading', { level: 1, name: 'Instance overview' }).waitFor());
}

const features = {
  login: async () => { await login(); await shot('02-after-login'); },
  'fleet-overview': async () => {
    await login();
    await check('provider accounts listed', () => page.getByRole('heading', { name: 'Provider accounts' }).waitFor());
    await check('openai provider row', () => page.getByText('openai', { exact: true }).first().waitFor());
    await check('quota section', () => page.getByRole('heading', { name: 'Quota by account' }).waitFor());
    await shot('02-fleet-overview');
  },
  'fleet-create-key': async () => {
    await login();
    const name = `verify-${Date.now()}`;
    await page.getByRole('navigation', { name: 'Fleet sections' }).getByRole('link', { name: 'Access' }).click();
    await check('Access view open', () => page.getByRole('heading', { level: 1, name: 'Access and models' }).waitFor());
    await check('Client keys tab selected', async () => {
      const sel = await page.getByRole('tab', { name: 'Client keys' }).getAttribute('aria-selected');
      if (sel !== 'true') throw new Error(`aria-selected=${sel}`);
    });
    await shot('02-access-before');
    await page.getByPlaceholder('e.g. pi, opencode, laptop').fill(name);
    await page.getByRole('button', { name: 'Create client key' }).click();
    await check('one-time secret dialog shown', () => page.getByRole('heading', { name: 'Copy this key now' }).waitFor());
    await shot('03-secret-shown');
    await check('close secret dialog with Done', () => page.getByRole('button', { name: 'Done' }).click({ timeout: 5000 }));
    await check(`managed keys list shows ${name}`, () => page.getByText(name).first().waitFor());
    await shot('04-key-listed');
    // Side effect: read back from the backend independently of the UI.
    const r = await fetch(`${MC_URL}/v0/management/fleet/keys`, { headers: { Authorization: `Bearer ${MC_KEY}` } });
    const body = await r.json();
    fs.writeFileSync(`${MC_OUT}/05-fleet-keys.json`, JSON.stringify(body.keys, null, 2)); // keys carry no secrets
    await check('backend GET /fleet/keys contains the new key', async () => {
      if (!body.keys.some((k) => k.name === name)) throw new Error('not found in backend');
    });
  },
  'nav-smoke': async () => {
    await login();
    for (const [route, text] of [['#/config', 'Config'], ['#/auth-files', 'Auth Files'], ['#/logs', 'Log'], ['#/system', 'System']]) {
      await page.goto(`${MC_URL}/management.html${route}`);
      await check(`${route} renders`, () => page.getByText(text).first().waitFor());
      await shot(`route-${route.slice(2).replace(/\W/g, '-')}`);
    }
  },
};

if (!features[feature]) { console.error(`unknown feature '${feature}'; one of: ${Object.keys(features).join(', ')}`); process.exit(2); }
const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
let rc = 0;
try { await features[feature](); } catch { rc = 1; await shot('zz-failure').catch(() => {}); }
fs.writeFileSync(`${MC_OUT}/result.json`, JSON.stringify({ feature, url: MC_URL, ok: rc === 0, steps, consoleErrors }, null, 2));
await browser.close();
log(rc === 0 ? `RESULT PASS ${feature}` : `RESULT FAIL ${feature}`);
process.exit(rc);
