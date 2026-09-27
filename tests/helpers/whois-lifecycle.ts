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
const { whoisDetail } = await import('../../src/checker/whois.ts');
for (const mode of ['success', 'abort', 'timeout', 'network', 'size']) {
  destroys = 0;
  const controller = new AbortController();
  const pending = whoisDetail('sample.sn', controller.signal, mode === 'timeout' ? 5 : 1000);
  assert.ok(socket!, 'The lookup must create its socket before receiving data');
  if (mode === 'success') {
    socket!.emit('data', Buffer.from('Nom de domaine: sample.sn\r\n'));
    socket!.emit('end');
  } else if (mode === 'abort') controller.abort();
  else if (mode === 'network') socket!.emit('error', new Error('ECONNRESET'));
  else if (mode === 'size') socket!.emit('data', Buffer.alloc(8 * 1024 * 1024 + 1));
  const result = await pending;
  assert.equal(result.terminationReason, ({ success: undefined, abort: 'cancelled', timeout: 'request_timeout', network: 'network_error', size: 'invalid_response' } as Record<string, string | undefined>)[mode]);
  assert.equal(result.attempts, 1);
  const before = destroys;
  socket!.emit('data', Buffer.from('NOT FOUND\r\n'));
  socket!.emit('end'); socket!.emit('error', new Error('late error')); controller.abort();
  assert.equal(destroys, before, 'Late events cannot settle or destroy again');
  assert.equal(destroys, mode === 'success' ? 0 : 1);
}
