// Run against a local built/dev server. The API is intercepted: no registry calls.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.TEMPER_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const result = '{"domain":"acme.com","tld":"com","status":"available","method":"rdap","responseTime":1}\n{"done":true,"elapsed":1}\n';
let held;
await page.route('**/api/check/**', async route => {
  const name = new URL(route.request().url()).searchParams.get('name');
  if (name === 'hold') { held = route; return; }
  return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: name === 'eof' ? result.split('\n')[0] + '\n' : result });
});
try {
  await page.goto(process.env.TEMPER_TEST_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollWidth <= width, `page overflows at ${width}px: ${scrollWidth}px`);
  }
  const region = page.locator('#play');
  const input = region.locator('input');
  await input.fill('hold');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#play').textContent.includes('resolving'));
  await page.keyboard.press('Escape');
  await input.waitFor({ timeout: 2000 });
  await page.waitForFunction(() => document.querySelector('#play input') === document.activeElement);
  assert.match(await region.textContent(), /type a name and hit enter/, 'Escape must reset a pending search');
  assert.equal(await input.evaluate(el => el === document.activeElement), true, 'reset must restore focus');
  if (held) await held.fulfill({ status: 200, contentType: 'application/x-ndjson', body: result }).catch(() => {});
  await input.fill('acme'); await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#play').textContent.includes('1 available'));
  await page.waitForFunction(() => document.querySelector('#play input') === document.activeElement);
  assert.equal(await input.evaluate(el => el === document.activeElement), true, 'completion must restore focus');
  assert.equal(await input.getAttribute('aria-label'), 'Domain name');
  await input.fill('eof'); await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#play').textContent.includes('incomplete'));
  await page.waitForFunction(() => document.querySelector('#play input') === document.activeElement);
  assert.equal(await input.evaluate(el => el === document.activeElement), true, 'failure must restore focus');
  assert.deepEqual(errors, []);
  console.log('PASS: pending Escape, stale response, completion/error focus, accessible name, incomplete stream');
} finally { await browser.close(); }
