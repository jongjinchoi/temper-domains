import assert from 'node:assert/strict';
import { rdapLookup } from '../../src/checker/rdap.ts';
const h2 = process.env.TRANSPORT_H2!;
const h1 = process.env.TRANSPORT_H1!;
if (process.env.TRANSPORT_REJECT_CERT === '1') {
  const result = await rdapLookup('unused.com', h2, new AbortController().signal);
  assert.equal(result.status, 'error'); assert.match(result.error!, /^tls:/);
  console.log('untrusted certificate rejected');
  process.exit(0);
}
for (const base of [h2, h1]) {
  const result = await rdapLookup('unused.com', base, new AbortController().signal);
  assert.equal(result.status, 'available', JSON.stringify(result));
}
console.log('ALPN h2 and HTTP/1.1 verified');

const alternative = await rdapLookup('unused.com', ['https://127.0.0.1:1', h2], new AbortController().signal);
assert.equal(alternative.status, 'available', JSON.stringify(alternative));
assert.equal(alternative.attempts, 2);
for (const domain of ['unused.com', 'denied.com', 'broken.com']) {
  const result = await rdapLookup(domain, [h2, h1], new AbortController().signal);
  assert.equal(result.attempts, 1, JSON.stringify(result));
  assert.equal(result.status, domain === 'unused.com' ? 'available' : 'error');
  if (domain === 'broken.com') assert.equal(result.terminationReason, 'invalid_response');
}
console.log('official alternative after connection failure; no alternate after 404, 403 or invalid payload');

for (const domain of ['taken.com','redirect.com','downgrade.com','stall.com']) {
  const controller = new AbortController();
  const timer = domain === 'stall.com' ? setTimeout(() => controller.abort(), 100) : undefined;
  const result = await rdapLookup(domain, h2, controller.signal);
  clearTimeout(timer);
  assert.equal(result.status, domain === 'taken.com' ? 'taken' : domain === 'redirect.com' ? 'available' : domain === 'stall.com' ? 'slow' : 'error', JSON.stringify(result));
  if (domain === 'redirect.com') assert.equal(result.attempts, 2);
}
const denied = await rdapLookup('limit.com', [h2, h1], new AbortController().signal);
assert.equal(denied.status, 'rate_limited'); assert.equal(denied.attempts, 1);
assert.ok(denied.retryAt);
const unavailable = await rdapLookup('unavailable.com', h1, new AbortController().signal);
assert.equal(unavailable.terminationReason, 'service_unavailable');
console.log('compression, redirects, downgrade rejection, cancellation and Retry-After verified');
