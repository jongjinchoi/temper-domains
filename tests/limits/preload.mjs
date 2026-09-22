// Only bootstrap and home are controlled. Domain requests use the real transport
// against a loopback server; no public registry is contacted.
import os from 'node:os';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
if (!process.env.TEMPER_LIMIT_TEST_HOME || !process.env.TEMPER_LIMIT_TEST_ORIGIN) throw new Error('Missing isolated test environment');
os.homedir = () => process.env.TEMPER_LIMIT_TEST_HOME;
const connect = net.createConnection;
net.createConnection = (port, host, listener) => {
  // Node's HTTP transport also calls net.createConnection with an options object.
  const target = new URL(process.env.TEMPER_LIMIT_TEST_ORIGIN);
  if (port && typeof port === 'object' && port.host === target.hostname && Number(port.port) === Number(target.port)) {
    return connect(port, host);
  }
  if (port !== 43 || host !== 'whois.nic.io') throw new Error('Unexpected WHOIS server');
  return connect(Number(process.env.TEMPER_LIMIT_TEST_WHOIS_PORT), '127.0.0.1', listener);
};
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import('bun:test');
  mock.module('node:net', () => ({ ...net, default: net }));
  mock.module('node:os', () => ({ ...os, default: os }));
}
// Fail before loading the application if named imports bypass the test boundary.
if ((await import('node:net')).createConnection !== net.createConnection || (await import('node:os')).homedir() !== process.env.TEMPER_LIMIT_TEST_HOME) {
  throw new Error('Test isolation was not installed');
}
globalThis.fetch = async input => {
  if (String(input) !== 'https://data.iana.org/rdap/dns.json') throw new Error(`Unexpected external fetch: ${input}`);
  return Response.json({ services: [[['com', 'net', 'org'], [process.env.TEMPER_LIMIT_TEST_ORIGIN]]] });
};
