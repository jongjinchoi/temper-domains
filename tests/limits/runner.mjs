import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createWhoisServer } from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = await mkdtemp(join(tmpdir(), 'temper-shared-limit-'));
let requests = [];
let status = 429;
let wait = '86400';
let responseDelay = 0;
const server = createServer((req, res) => {
  requests.push({ at: Date.now(), path: req.url });
  const code = status;
  const headers = wait === undefined ? {} : { 'Retry-After': wait };
  setTimeout(() => { res.writeHead(code, headers); res.end(); }, responseDelay);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let whoisRequests = 0;
const whoisServer = createWhoisServer(socket => socket.once('data', () => {
  whoisRequests++; socket.end('Quota exceeded: please try later\r\n');
}));
await new Promise(resolve => whoisServer.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const runtime of ['bun', 'node']) {
    const home = await mkdtemp(join(root, `${runtime}-`));
    const env = { ...process.env, HOME: home, TEMPER_LIMIT_TEST_HOME: home, TEMPER_LIMIT_TEST_ORIGIN: origin, TEMPER_LIMIT_TEST_WHOIS_PORT: String(whoisServer.address().port), NO_COLOR: '1' };
    const prefix = runtime === 'bun' ? ['--preload', resolve('tests/limits/preload.mjs'), resolve('src/index.ts')] : ['--import', resolve('tests/limits/preload.mjs'), resolve('dist/npm/index.js')];
    const cli = (args, onStart) => new Promise((resolve, reject) => {
      const child = spawn(runtime, [...prefix, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      onStart?.(child);
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI test timeout')); }, 15000);
      child.on('error', reject);
      child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${runtime} ${code}: ${stderr}\n${stdout}`)); });
    });
    const search = name => cli(['search', name, '--tlds', 'com', '--format', 'json']).then(JSON.parse);
    status = 429; wait = '86400'; responseDelay = 0; requests = [];
    const first = (await search('initial'))[0];
    assert.equal(first.terminationReason, 'rate_limited', JSON.stringify(first)); assert.equal(first.attempts, 1); assert.equal(first.retryAtSource, 'server');
    assert.equal(requests.length, 1);
    const detail = JSON.parse(await cli(['whois', 'detail.com', '--format', 'json']));
    assert.equal(detail.terminationReason, 'server_cooldown'); assert.equal(detail.attempts, 0); assert.equal(detail.retryAt, first.retryAt);
    const client = new Client({ name: 'shared-limit-regression', version: '1.0.0' });
    try {
      await client.connect(new StdioClientTransport({ command: runtime, args: [...prefix, 'mcp'], env }));
      const result = await client.callTool({ name: 'check_domain_availability', arguments: { domains: ['other.com', 'other.net'] } });
      assert.match(JSON.stringify(result), /Not sent: previous server limit/);
      assert.match(JSON.stringify(result), /attempts: 0/);
      assert.match(JSON.stringify(result), /server Retry-After/);
    } finally { await client.close(); }
    assert.equal(requests.length, 1, 'new CLI and MCP processes must not transmit during cooldown');
    const file = join(home, '.temper/state/lookup-limits.json');
    const state = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(state.servers[origin].strikes, 1);
    assert.deepEqual(state.servers[origin].leases, []);
    // Explicit clock-boundary fixture: expire the prior cooldown without waiting
    // a day. This is controlled integration evidence, not a registry retest.
    state.servers[origin].blockedUntil = Date.now() - 1;
    await writeFile(file, JSON.stringify(state));
    requests = []; wait = undefined;
    const rejected = await Promise.all([search('probeone'), search('probetwo')]);
    assert.equal(requests.length, 1, 'only one new probe may reach the limited server');
    assert.deepEqual(rejected.flat().map(r => r.attempts).sort(), [0, 1]);
    const next = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(next.servers[origin].strikes, 2);
    assert.equal(next.servers[origin].source, 'client_policy');
    assert.ok(next.servers[origin].blockedUntil - next.servers[origin].observedAt >= 120000);
    next.servers[origin].blockedUntil = Date.now() - 1;
    await writeFile(file, JSON.stringify(next));
    requests = []; status = 404; responseDelay = 450;
    const successful = await Promise.all([search('successone'), search('successtwo'), search('successthree')]);
    assert.ok(successful.flat().every(r => r.status === 'available'));
    assert.equal(requests.length, 3);
    assert.ok(requests[1].at - requests[0].at >= 440, 'the second request must wait for the probe response');
    assert.ok(requests[2].at - requests[1].at >= 290, 'normal starts retain the shared 300ms interval');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).servers[origin].strikes, 0);
    whoisRequests = 0;
    const whoisFirst = JSON.parse(await cli(['search', 'whoisone', '--tlds', 'io', '--format', 'json']))[0];
    assert.equal(whoisRequests, 1, 'WHOIS must reach our loopback fixture');
    assert.equal(whoisFirst.status, 'rate_limited'); assert.equal(whoisFirst.retryAtSource, 'client_policy');
    assert.match(whoisFirst.error, /Quota exceeded/);
    const whoisNext = JSON.parse(await cli(['whois', 'whoistwo.io', '--format', 'json']));
    assert.equal(whoisNext.terminationReason, 'server_cooldown'); assert.equal(whoisNext.attempts, 0);
    assert.equal(whoisRequests, 1);
    // Kill our own child during network I/O, leaving its persisted lease behind.
    // Another command should reclaim it without waiting for the old deadline.
    requests = []; status = 404; responseDelay = 5000;
    let killed;
    const interrupted = cli(['search', 'interrupted', '--tlds', 'com', '--format', 'json'], child => { killed = child; }).then(
      () => { throw new Error('Expected the interrupted CLI to exit unsuccessfully'); },
      error => error,
    );
    const deadline = Date.now() + 4000;
    try {
      while (!requests.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(requests.length, 1);
      const active = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(active.servers[origin].leases[0].pid, killed.pid);
    } finally { killed.kill('SIGKILL'); }
    await interrupted;
    responseDelay = 0;
    const resumed = (await search('afterexit'))[0];
    assert.equal(resumed.status, 'available');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).servers[origin].leases, []);
    // Corruption is not silently treated as "no previous limit".
    await writeFile(file, '{broken'); requests = [];
    const damaged = (await search('damaged'))[0];
    assert.equal(damaged.terminationReason, 'limit_state_error'); assert.equal(damaged.attempts, 0); assert.equal(requests.length, 0);
    assert.equal(await readFile(file, 'utf8'), '{broken');
    console.log(`${runtime}: CLI -> restarted CLI/detail -> MCP shared cooldown, one probe, recovery, spacing, WHOIS, killed-process leases and corruption passed`);
  }
} finally {
  await new Promise(resolve => whoisServer.close(resolve));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
