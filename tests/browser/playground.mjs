// Run against a local built/dev server. The API is intercepted: no registry calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const license = await page.request.get(new URL('/license/', page.url()).href);
  assert.equal(license.status(), 200);
  assert.equal(await license.text(), readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8'));
  const notices = await page.request.get(new URL('/notices/', page.url()).href);
  assert.equal(notices.status(), 200);
  assert.equal(await notices.text(), readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'));
  assert.equal(await page.getByRole('link', { name: 'AGPL-3.0-only', exact: true }).getAttribute('href'), '/license/');
  const sourceLink = page.getByRole('link', { name: 'source', exact: true });
  if (await sourceLink.count()) assert.match(await sourceLink.getAttribute('href'), /\/tree\/[a-f0-9]{40}$/);
  else await page.getByText('local source · unpublished', { exact: true }).waitFor();
  const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
  assert.ok(jsonLd.some(text => text.includes('/license/')));
  assert.ok(jsonLd.some(text => text.includes('AGPL-3.0-only')));
  assert.doesNotMatch(jsonLd.join('\n'), /Apache/i);
  const llms = await page.request.get(new URL('/llms.txt', page.url()).href);
  assert.match(await llms.text(), /License: AGPL-3\.0-only/);
  assert.match(await llms.text(), /This website's source:/);
  const copy = page.getByRole('button', { name: 'Copy install command' });
  for (const mode of ['denied', 'missing', 'success', 'race']) {
    await page.evaluate(mode => {
      window.copyWrites = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : {
        writeText(text) {
          window.copyWrites.push(text);
          if (mode === 'denied') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
          if (mode === 'race') return new Promise((resolve, reject) => { (window.copyPending ??= []).push({ resolve, reject }); });
          return Promise.resolve();
        },
      } });
    }, mode);
    await copy.click();
    if (mode === 'race') {
      await copy.click();
      await page.evaluate(() => window.copyPending[1].reject(new Error('Denied')));
      await page.getByText('Copy failed — select the command').waitFor();
      await page.evaluate(() => window.copyPending[0].resolve());
      await page.waitForTimeout(1300);
    }
    if (mode === 'success') {
      await page.getByText('Command copied', { exact: true }).waitFor();
      assert.match(await copy.textContent(), /copied ✓/);
      assert.deepEqual(await page.evaluate(() => window.copyWrites), ['brew install jongjinchoi/temper-domains/temper']);
    } else {
      await page.getByText('Copy failed — select the command').waitFor();
      assert.doesNotMatch(await copy.textContent(), /copied ✓/);
      assert.match(await copy.textContent(), /brew install/);
      if (mode === 'denied') {
        await copy.locator('span').nth(1).dblclick();
        assert.ok((await page.evaluate(() => String(window.getSelection()))).length > 0, 'manual-copy guidance must offer selectable command text');
      }
    }
  }
  const themes = await page.locator('#themes').textContent();
  assert.equal(themes.split('Illustrative theme preview').length - 1, 7);
  assert.doesNotMatch(themes, /15 TLDs|1\.5s|12 · 3 taken|Terminal native/);
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
  console.log('PASS: license/notices/source/JSON-LD/llms, 390/1440 layout, clipboard and lookup interaction contracts (intercepted API)');
} finally { await browser.close(); }
