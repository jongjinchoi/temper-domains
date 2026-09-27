// Real loopback transport; acknowledge receipt before sending the next fragment.
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
const connect = net.createConnection;
let chunks = [], observed = [], next, peer, stall = false;
const server = net.createServer(socket => {
  peer = socket;
  socket.on('error', () => {}); // The size-limit client intentionally disconnects.
  socket.once('data', () => {
    if (stall) return;
    const send = () => {
      const chunk = chunks.shift();
      if (!chunk) { socket.end(); return; }
      next = send;
      socket.write(chunk);
    };
    send();
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const redirected = (port, host, callback) => {
  assert.equal(port, 43); assert.equal(host, 'whois.nic.sn');
  const socket = connect(server.address().port, '127.0.0.1', callback);
  socket.on('data', data => {
    observed.push(data.length);
    const send = next; next = undefined;
    if (send) setImmediate(send);
  });
  return socket;
};
if (typeof Bun !== 'undefined') {
  const { mock } = await import('bun:test');
  mock.module('node:net', () => ({ ...net, createConnection: redirected }));
} else {
  net.createConnection = redirected;
  syncBuiltinESMExports();
}
globalThis.fetch = async () => { throw new Error('Public network forbidden'); };
const { whoisDetail, whoisLookup } = await import(process.env.TEMPER_WHOIS_MODULE || '../../src/checker/whois.ts');
const body = Buffer.from('Nom de domaine: sample.sn\r\nDate de création: 2020-01-02T00:00:00Z\r\nRemark: 한😀\r\n');
const limit = 8 * 1024 * 1024;
async function detail(parts) {
  chunks = [...parts]; observed = []; next = undefined;
  return whoisDetail('sample.sn', new AbortController().signal, 3000);
}
try {
  const baseline = await detail([body]);
  assert.equal(baseline.createdDate, '2020-01-02T00:00:00.000Z');
  for (const character of ['é', '한', '😀']) {
    for (let offset = 1; offset < Buffer.byteLength(character); offset++) {
      const cut = body.indexOf(Buffer.from(character)) + offset;
      const result = await detail([body.subarray(0, cut), body.subarray(cut)]);
      assert.equal(observed[0], cut, 'The client must receive the split character');
      assert.equal(result.rawWhois, body.toString(), `split ${character}:${offset}`);
      assert.equal(result.createdDate, baseline.createdDate);
      assert.equal(result.status, 'taken');
    }
  }
  const exact = Buffer.concat([body, Buffer.alloc(limit - body.length, 32)]);
  assert.equal((await detail([exact])).status, 'taken');
  for (const lookup of [whoisDetail, whoisLookup]) {
    chunks = [exact, Buffer.from('x')]; observed = []; next = undefined;
    const result = await lookup('sample.sn', new AbortController().signal, 3000);
    assert.equal(result.status, 'error');
    assert.equal(result.terminationReason, 'invalid_response');
    assert.equal(result.attempts, 1);
    assert.equal(result.rawWhois, undefined, 'Never expose a partial oversized response');
  }
  const oversized = await detail([Buffer.alloc(limit + 1, 32)]);
  assert.equal(oversized.terminationReason, 'invalid_response');
  stall = true;
  for (const lookup of [whoisLookup, whoisDetail]) {
    const result = await lookup('sample.sn', new AbortController().signal, 20);
    assert.equal(result.status, 'slow');
    assert.equal(result.terminationReason, 'request_timeout');
    assert.equal(result.attempts, 1);
    assert.equal(result.error, 'whois timeout');
  }
  console.log('WHOIS UTF-8 boundaries, byte limit and request timeout passed');
} finally {
  peer?.destroy();
  await new Promise(resolve => server.close(resolve));
}
