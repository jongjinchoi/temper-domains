import './preload.mjs';
import fs from 'node:fs/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const stateFile = join(process.env.TEMPER_LIMIT_TEST_HOME, '.temper/state/lookup-limits.json');
const origin = process.env.TEMPER_LIMIT_TEST_ORIGIN;
const entry = file => JSON.parse(readFileSync(file, 'utf8')).servers[origin];
const trace = event => appendFileSync(process.env.TEMPER_LIMIT_TEST_TRACE,
  JSON.stringify({ pid: process.pid, at: Date.now(), ...event }) + '\n');

// Observe the atomic replacement while FileLimitStore still owns its lock.
// Do not change the stored policy, clocks, leases or transport implementation.
const rename = fs.rename;
fs.rename = async (from, to) => {
  if (!process.env.TEMPER_LIMIT_TEST_TRACE || String(to) !== stateFile) return rename(from, to);
  const previous = entry(stateFile);
  const state = entry(from);
  const admitted = state.leases.filter(lease => !previous.leases.some(old => old.id === lease.id));
  await rename(from, to);
  trace({ type: 'state', state, admitted });
};

const request = http.request;
http.request = function (...args) {
  if (!process.env.TEMPER_LIMIT_TEST_TRACE) return request.apply(this, args);
  const url = new URL(String(args[0]));
  if (url.origin !== origin) throw new Error('Unexpected recovery HTTP origin');
  const state = entry(stateFile);
  const lease = state.leases.find(value => value.pid === process.pid);
  if (!lease) throw new Error('Recovery request has no shared lease');
  const before = Date.now();
  const injectedMs = state.successes === 1 ? Number(process.env.TEMPER_LIMIT_TEST_DELAY_MS) : 0;
  if (injectedMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, injectedMs);
  trace({ type: 'transport', leaseId: lease.id, path: url.pathname, before, injectedMs });
  const outgoing = request.apply(this, args);
  outgoing.once('finish', () => trace({ type: 'finish', leaseId: lease.id, path: url.pathname }));
  return outgoing;
};
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import('bun:test');
  mock.module('node:fs/promises', () => ({ ...fs, default: fs }));
  mock.module('node:http', () => ({ ...http, default: http }));
}
if ((await import('node:fs/promises')).rename !== fs.rename || (await import('node:http')).request !== http.request) {
  throw new Error('Recovery tracing was not installed');
}
