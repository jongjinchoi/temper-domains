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
  if (name === 'partial') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: [
    { domain: 'partial.com', tld: 'com', status: 'available', method: 'rdap', responseTime: 10 },
    { domain: 'partial.net', tld: 'net', status: 'slow', method: 'rdap', responseTime: 3000, confidence: 'low', reason: 'Time limit reached before this domain could be queried' },
    { done: true, elapsed: 3000, summary: { requested: 15, attempted: 1, answered: 1, unresolved: 14, elapsedMs: 3000 } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n' });
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
  await input.fill('partial'); await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#play').textContent.includes('14 unresolved'));
  assert.match(await region.textContent(), /1\/15 answered/);
  assert.match(await region.textContent(), /14 not queried/);
  assert.match(await region.textContent(), /before this domain could be queried/);
  assert.match(await region.textContent(), /Confirm purchase availability/);
  await input.fill('eof'); await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('#play').textContent.includes('incomplete'));
  await page.waitForFunction(() => document.querySelector('#play input') === document.activeElement);
  assert.equal(await input.evaluate(el => el === document.activeElement), true, 'failure must restore focus');
  assert.deepEqual(errors, []);
  console.log('PASS: pending Escape, stale response, completion/error focus, accessible name, incomplete stream, partial coverage and reason');
} finally { await browser.close(); }
