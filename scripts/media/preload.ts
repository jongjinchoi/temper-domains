import { mock } from 'bun:test';
import * as os from 'node:os';
import { appendFileSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fixture } from './fixture.ts';

const home = process.env.TEMPER_MEDIA_HOME;
if (!home || !isAbsolute(home) || !existsSync(join(home, '.temper-media-home'))) throw new Error('Recording requires a marked temporary home');
mock.module('node:os', () => ({ ...os, homedir: () => home }));
function blocked(operation: string): never {
  appendFileSync(join(home!, 'blocked.log'), `${operation.slice(0, 200)}\n`);
  throw new Error(`Recording blocked unexpected operation: ${operation}`);
}
mock.module('../../src/registrar/browser.ts', () => ({ openBrowser: () => blocked('openBrowser') }));
mock.module('../../src/checker/whois.ts', () => ({ whoisLookup: () => blocked('WHOIS'), whoisDetail: () => blocked('WHOIS detail') }));
mock.module('../../src/update/runner.ts', () => ({ performUpdate: () => blocked('installer'), updateCommands: () => blocked('installer commands') }));

const { EXTENDED_TLDS } = await import('../../src/checker/types.ts');
const { rdapTransport } = await import('../../src/checker/http-transport.ts');
const suffixes = new Set<string>(EXTENDED_TLDS);
const localFetch = globalThis.fetch;
const respond = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  init?.signal?.throwIfAborted();
  // Yoga's bundled WASM uses a local data URL; it does not contact a server.
  if (url.startsWith('data:application/octet-stream;base64,')) return localFetch(input, init);
  if (url === 'https://data.iana.org/rdap/dns.json') {
    return Response.json({ services: [...suffixes].map(tld => [[tld], [`https://${tld}.media.test/`]]) });
  }
  const match = /^https:\/\/([a-z]+)\.media\.test\/domain\/([a-z0-9.-]+)$/.exec(url);
  if (!match || !suffixes.has(match[1]!) || !match[2]!.includes(fixture.query) || !match[2]!.endsWith(`.${match[1]}`)) return blocked(url);
  appendFileSync(join(home!, 'requests.log'), `${match[2]}\n`);
  if (process.env.TEMPER_MEDIA_SCENARIO === 'partial' && match[2] === fixture.partialDomain) return new Response(null, { status: 400 });
  if (fixture.registered.includes(match[2]!)) return Response.json({ objectClassName: 'domain', ldhName: match[2] });
  return new Response(null, { status: 404 });
};
globalThis.fetch = respond as typeof fetch;
rdapTransport.request = (url, init) => respond(url, init);
// Manual and automatic version checks must not contact a registry while recording.
process.env.TEMPER_NO_UPDATE_CHECK = '1';
