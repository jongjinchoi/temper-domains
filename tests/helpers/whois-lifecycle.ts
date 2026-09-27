import { mock } from "bun:test";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import net from "node:net";
let socket: EventEmitter & { destroy(): void; write(): void };
let destroys = 0;
mock.module('node:net', () => ({ ...net, createConnection: (_port: number, _host: string, onConnect: () => void) => {
  socket = Object.assign(new EventEmitter(), { write() {}, destroy() { destroys++; } });
  queueMicrotask(onConnect);
  return socket;
} }));
globalThis.fetch = Object.assign(async () => { throw new Error('Public network forbidden'); }, { preconnect() {} });
const { whoisDetail, whoisLookup } = await import('../../src/checker/whois.ts');
const { LookupAbort, createRun } = await import('../../src/checker/run.ts');
const { canResume } = await import('../../src/checker/retry.ts');
const { lookupResult } = await import('../../src/mcp/lookup-result.ts');
const lookup = process.argv[2] === 'lookup' ? whoisLookup : whoisDetail;
for (const mode of ['success', 'abort', 'deadline', 'before-start', 'timeout', 'network', 'size']) {
  destroys = 0;
  const controller = new AbortController();
  if (mode === 'before-start') controller.abort(new LookupAbort('deadline'));
  const pending = lookup('sample.sn', controller.signal, mode === 'timeout' ? 5 : 1000);
  if (mode === 'before-start') {
    const result = await pending;
    assert.equal(result.status, 'slow');
    assert.equal(result.terminationReason, 'deadline_before_start');
    assert.equal(result.attempts, 0);
    assert.equal(destroys, 0);
    continue;
  }
  assert.ok(socket!, 'The lookup must create its socket before receiving data');
  if (mode === 'success') {
    socket!.emit('data', Buffer.from('Nom de domaine: sample.sn\r\n'));
    socket!.emit('end');
  } else if (mode === 'abort') controller.abort();
  else if (mode === 'deadline') controller.abort(new LookupAbort('deadline'));
  else if (mode === 'network') socket!.emit('error', new Error('ECONNRESET'));
  else if (mode === 'size') socket!.emit('data', Buffer.alloc(8 * 1024 * 1024 + 1));
  const result = await pending;
  assert.equal(result.status, ({ success: 'taken', abort: 'slow', deadline: 'slow', timeout: 'slow', network: 'error', size: 'error' } as Record<string, string>)[mode]);
  assert.equal(result.terminationReason, ({ success: undefined, abort: 'cancelled', deadline: 'deadline', timeout: 'request_timeout', network: 'network_error', size: 'invalid_response' } as Record<string, string | undefined>)[mode]);
  assert.equal(result.attempts, 1);
  const row = { ...result, tld: 'sn' };
  assert.equal(canResume(row), !['success', 'size'].includes(mode));
  assert.deepEqual(lookupResult('', [row]).structuredContent.retryPlan.eligible, ['success', 'size'].includes(mode) ? [] : ['sample.sn']);
  const before = destroys;
  socket!.emit('data', Buffer.from('NOT FOUND\r\n'));
  socket!.emit('end'); socket!.emit('error', new Error('late error')); controller.abort();
  assert.equal(destroys, before, 'Late events cannot settle or destroy again');
  assert.equal(destroys, mode === 'success' ? 0 : 1);
}

if (process.argv[2] === 'integration') {
  const { lookupDomainAvailability } = await import('../../src/checker/lookup.ts');
  const { domainDetail } = await import('../../src/checker/detail.ts');
  const { LimitCoordinator, MemoryLimitStore } = await import('../../src/checker/limits.ts');
  const limits = new LimitCoordinator(new MemoryLimitStore());
  const run = createRun(15000, undefined, 20, 10, limits);
  try {
    const row = await lookupDomainAvailability('sample.sn', null, run.signal, 10, 'sn', run.context);
    const detail = await domainDetail('sample.sn', { timeoutMs: 15000, limits });
    for (const result of [row, detail]) {
      assert.equal(result.status, 'slow');
      assert.equal(result.terminationReason, 'request_timeout');
      assert.equal(result.attempts, 1);
      assert.equal(result.error, 'whois timeout');
      assert.match(result.reason!, /request time limit/);
    }
    assert.deepEqual(lookupResult('', [row]).structuredContent.retryPlan.eligible, ['sample.sn']);
  } finally { run.close(); }
}
