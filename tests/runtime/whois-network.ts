// Isolated process: redirect only WHOIS to a closed loopback port.
import net from 'node:net';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
const server = net.createServer();
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as net.AddressInfo).port;
await new Promise<void>(resolve => server.close(() => resolve()));
const connect = net.createConnection;
mock.module('node:net', () => ({ ...net, createConnection: (p: number, h: string, listener: () => void) => {
  assert.equal(p, 43); assert.equal(h, 'whois.nic.io');
  return connect(port, '127.0.0.1', listener);
} }));
globalThis.fetch = Object.assign(async () => { throw new Error('Public network forbidden'); }, { preconnect() {} });
const { whoisLookup, whoisDetail } = await import('../../src/checker/whois.ts');
const { canResume } = await import('../../src/checker/retry.ts');
const { SearchSession } = await import('../../src/tui/search-session.ts');
const row = await whoisLookup('sample.io', new AbortController().signal);
const detail = await whoisDetail('sample.io', new AbortController().signal);
for (const result of [row, detail]) {
  assert.equal(result.status, 'error'); assert.equal(result.attempts, 1);
  assert.equal(result.terminationReason, 'network_error');
  assert.match(result.error!, /ECONNREFUSED|connect/i);
}
assert.equal(canResume(row), true);
const answered = { ...row, domain: 'sample.com', tld: 'com', status: 'taken' as const, terminationReason: undefined };
let round = 0;
const session = new SearchSession('sample', ['io', 'com'], undefined, async function* (domains) {
  if (round++ === 0) { yield row; yield answered; }
  else { assert.deepEqual(domains, ['sample.io']); yield { ...row, status: 'available', terminationReason: undefined }; }
}, { add: async () => {}, replace: async () => true });
await session.start(); await session.resume(['sample.io']);
assert.equal(session.getSnapshot().results.get('sample.com'), answered);
assert.equal(session.getSnapshot().results.get('sample.io')?.status, 'available');
