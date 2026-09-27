import "./home.ts";
import React from "react";
import { render } from "ink";
import { mock } from "bun:test";
import { PassThrough, Writable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const mode = process.argv[2]!;
process.env.TZ = "Asia/Seoul";
const home = process.env.TEMPER_TEST_HOME!;
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
globalThis.fetch = Object.assign(async () => { throw new Error("Public network forbidden"); }, { preconnect() {} });
const row = (domain: string) => ({ domain, tld: domain.split('.').at(-1)!, status: mode.endsWith('-long') ? 'error' as const : 'available' as const,
  method: 'rdap' as const, responseTime: 1, attempts: 1,
  ...(mode.endsWith('-long') ? { error: 'Controlled failure '.repeat(12) + 'END-OF-DETAIL' } : {}),
});
const suggested: string[][] = [];
const lookups: string[][] = [];
mock.module("../../src/checker/checker.ts", () => ({
  checkFullDomains: async function* (domains: string[], options: any = {}) {
    lookups.push(domains);
    if (mode === "escape") { await new Promise<void>(resolve => options.signal.addEventListener("abort", () => resolve(), { once: true })); return; }
    for (const domain of domains) yield row(domain);
  },
  checkSuggestionMatrix: async (names: string[], tlds: string[], options: any = {}) => {
    suggested.push(names);
    return names.map(name => ({ name, results: tlds.map(tld => { const result = row(`${name}.${tld}`); options.onResult?.(name, result); return result; }) }));
  },
}));
mock.module("../../src/registrar/browser.ts", () => ({ openBrowser: async (url: string) => ({ kind: 'accepted', url }) }));
let entries = (mode === "watch-height" ? Array.from({ length: 30 }, (_, i) => `item${i}.com`)
  : mode === 'watch-compact-keys' ? ['a.com', 'b.com', 'c.com'] : ['only.com'])
  .map(domain => ({ domain, addedAt: '2026-09-27T00:00:00Z' }));
let rejectDelete: ((error: Error) => void) | undefined;
let resolveAdd: (() => void) | undefined;
let releaseLoad: (() => void) | undefined;
let loads = 0;
const deleted: string[] = [];
mock.module("../../src/config/watchlist.ts", () => ({
  loadWatchlist: async () => {
    if (mode === 'watch-reload-failure' && loads++ > 0) throw new Error('Controlled read failure');
    const snapshot = entries.map(e => ({ ...e }));
    if (mode === 'watch-load-race' && ++loads === 2) await new Promise<void>(resolve => { releaseLoad = resolve; });
    return snapshot;
  },
  addWatch: async () => { if (mode === "notice-late") await new Promise<void>(resolve => { resolveAdd = resolve; }); },
  removeWatch: async (domain: string) => {
    deleted.push(domain);
    if (mode === "watch-race") await new Promise((_resolve, reject) => { rejectDelete = reject; });
    else {
      if (mode === 'watch-reload-failure') throw new Error('Controlled delete failure');
      entries = entries.filter(e => e.domain !== domain);
      if (mode === 'watch-committed-failure') throw new Error('Controlled cleanup failure');
    }
  },
}));
await mkdir(home + '/.temper', { recursive: true });
const historyFile = home + '/.temper/history.json';
const historyLength = mode === "history-height" ? 100 : mode === 'history-compact-keys' || mode === 'history-hidden-list-keys' ? 3 : 1;
await writeFile(historyFile, JSON.stringify(Array.from({ length: historyLength }, (_, i) => ({
  query: `sample${i}`, timestamp: '2026-09-27T23:30:00.000Z', available: 1, total: 1,
}))));
const historyQueries = async () => JSON.parse(await readFile(historyFile, 'utf8')).map((entry: { query: string }) => entry.query);
const { default: HistoryView } = await import('../../src/tui/HistoryView.tsx');
const { default: WatchlistView } = await import('../../src/tui/WatchlistView.tsx');
const { default: SuggestView } = await import('../../src/tui/SuggestView.tsx');
const { default: SearchView } = await import('../../src/tui/SearchView.tsx');
const { default: App } = await import('../../src/tui/App.tsx');
let frame = '';
const output = new Writable({ write(chunk, _encoding, callback) { if (chunk.length) frame = String(chunk); callback(); } });
Object.assign(output, { columns: 110, rows: 24, isTTY: true });
const input = new PassThrough();
Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const element = mode.startsWith('history') ? <HistoryView /> : mode.startsWith('watch-') ? <WatchlistView />
  : mode === 'suggest-duplicate' ? <SuggestView query="Acme" prefixes={['Get', 'get']} suffixes={['App']} />
  : mode === 'suggest-height' || mode === 'suggest-long' || mode === 'suggest-compact-keys' ? <SuggestView query={mode === 'suggest-long' ? '한글' : 'acme'} /> : mode === 'escape' ? <App query="acme" tlds={['com']} /> : <SearchView query="acme" tlds={['com']} />;
const view = render(element, { stdout: output as any, stderr: output as any, stdin: input as any, debug: true, patchConsole: false, exitOnCtrlC: false });
const plain = () => frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
async function until(label: string, predicate: () => boolean) {
  const deadline = Date.now() + 2500;
  do { await view.waitUntilRenderFlush(); if (predicate()) return; await Bun.sleep(10); } while (Date.now() < deadline);
  throw new Error('Timed out: ' + label + '\n' + plain());
}
async function key(value: string) { input.write(value); await view.waitUntilRenderFlush(); await Bun.sleep(20); }
const frames: Record<string, string> = {};
try {
  await until('initial', () => mode.startsWith('history') ? plain().includes('sample0')
    : mode.startsWith('watch-') ? plain().includes(mode.endsWith('-long') ? 'error' : 'available')
    : mode.startsWith('suggest') ? plain().includes('names checked') : mode === 'escape' ? plain().includes('Searching') : plain().includes('Search complete'));
  frames.initial = plain();
  if (mode.endsWith('-long')) {
    assert.ok(plain().trimEnd().split('\n').length <= 24, plain());
    Object.assign(output, { columns: 60, rows: 16 }); output.emit('resize');
    await until('long narrow row', () => plain().includes('Enlarge terminal') && plain().includes('▸'));
    assert.ok(plain().trimEnd().split('\n').length <= 16, plain());
    Object.assign(output, { columns: 160, rows: 40 }); output.emit('resize');
    await until('full error readable', () => plain().includes('END-OF-DETAIL'));
    assert.match(plain(), /▸/);
  }
  if (mode === 'history-date') assert.match(plain(), /2026-09-28 08:30/);
  if (mode === 'suggest-duplicate') {
    assert.match(plain(), /3 names checked/);
    assert.deepEqual(suggested, [['Acme', 'GetAcme', 'AcmeApp']]);
    assert.match(plain(), /3 available/);
  }
  if (mode.endsWith('-height')) {
    assert.ok(plain().trimEnd().split('\n').length <= 24, plain());
    const count = mode === 'history-height' ? 100 : mode === 'watch-height' ? 30 : 15;
    for (let i = 1; i < count; i++) await key('j');
    frames.last = plain();
    assert.match(plain(), mode === 'history-height' ? /▸\s*2026-09-28 08:30\s+sample99/ : mode === 'watch-height' ? /▸\s+item29.com/ : /▸\s+acmekit/);
    assert.ok(plain().trimEnd().split('\n').length <= 24, plain());
    Object.assign(output, { columns: 80, rows: 20 }); output.emit('resize');
    await until('resize', () => plain().trimEnd().split('\n').length <= 20);
    frames.resized = plain();
    assert.match(plain(), /▸/);
    Object.assign(output, { columns: 40, rows: 16 }); output.emit('resize');
    await until('narrow resize', () => plain().trimEnd().split('\n').length <= 16 && /q\s+quit/.test(plain().replace(/[│\n]/g, ' ')));
    assert.match(plain(), /▸/);
    frames.narrow = plain();
    Object.assign(output, { columns: 20, rows: 8 }); output.emit('resize');
    await until('compact', () => plain().includes('Enlarge terminal'));
    assert.ok(plain().trimEnd().split('\n').length <= 8);
    assert.match(plain(), /q quit/);
  }
  if (mode === 'escape') {
    assert.match(plain(), /esc quit/);
    let exited = false; void view.waitUntilExit().then(() => { exited = true; });
    await key('\x1b'); await until('exit', () => exited);
  }
  if (mode === 'watch-cursor') {
    await key('d'); await until('empty', () => plain().includes('Watchlist is empty'));
    entries = [{ domain: 'new.com', addedAt: '2026-09-27T00:00:00Z' }];
    await key('r'); await until('refreshed', () => plain().includes('new.com'));
    assert.match(plain(), /▸\s+new.com/);
    await key('d'); await until('deleted', () => plain().includes('Watchlist is empty'));
    assert.deepEqual(deleted, ['only.com', 'new.com']);
  }
  if (mode === 'watch-race') {
    await key('d'); await until('delete started', () => !!rejectDelete);
    assert.match(plain(), /only.com/); // Pending deletion keeps the row visible.
    entries = [{ domain: 'fresh.com', addedAt: '2026-09-27T00:00:00Z' }];
    await key('r'); await key('r'); await key('d');
    assert.deepEqual(deleted, ['only.com']);
    rejectDelete!(new Error('Controlled delete failure'));
    await until('failure reconciled', () => plain().includes('fresh.com') && plain().includes('Controlled delete failure'));
    frames.reconciled = plain();
    assert.doesNotMatch(plain(), /only.com/);
  }
  if (mode === 'watch-load-race') {
    await key('r'); await until('refresh started', () => !!releaseLoad);
    await key('d'); await until('deleted', () => plain().includes('Watchlist is empty'));
    releaseLoad!();
    await Bun.sleep(30); await view.waitUntilRenderFlush();
    assert.match(plain(), /Watchlist is empty/);
    assert.doesNotMatch(plain(), /only.com/);
  }
  if (mode === 'watch-committed-failure') {
    await key('d'); await until('reconciled committed deletion', () => plain().includes('Watchlist is empty'));
    assert.match(plain(), /Controlled cleanup failure/);
    assert.doesNotMatch(plain(), /only.com/);
  }
  if (mode === 'watch-reload-failure') {
    await key('d'); await until('reload failed', () => plain().includes('Could not reload'));
    assert.match(plain(), /only.com/);
    assert.match(plain(), /press r to retry/);
  }
  if (mode.startsWith('notice-')) {
    await key('a');
    await until('add started', () => mode === 'notice-late' ? !!resolveAdd : plain().includes('Added acme.com'));
    await key('\r'); await until('registrar', () => plain().includes('Where to buy?'));
    await key('c'); await until('browser feedback', () => plain().includes('Browser open request accepted'));
    if (resolveAdd) { resolveAdd(); await Bun.sleep(30); } else await Bun.sleep(3100);
    await view.waitUntilRenderFlush();
    assert.match(plain(), /Browser open request accepted/);
    frames.final = plain();
  }
  if (mode.endsWith('-compact-keys')) {
    const first = mode === 'history-compact-keys' ? /▸\s*\S+ \S+\s+sample0\s/ : mode === 'watch-compact-keys' ? /▸\s+a\.com\s/ : /▸\s+acme\s/;
    assert.match(plain(), first);
    const lookupCount = lookups.length;
    Object.assign(output, { columns: 20, rows: 8 }); output.emit('resize');
    await until('compact', () => plain().includes('Enlarge terminal'));
    // Row actions must not reach a list the screen does not show.
    for (const value of ['j', 'd', '\r']) await key(value);
    await Bun.sleep(50); await view.waitUntilRenderFlush();
    frames.compact = plain();
    assert.deepEqual(deleted, []);
    assert.deepEqual(await historyQueries(), Array.from({ length: historyLength }, (_, i) => `sample${i}`));
    assert.equal(lookups.length, lookupCount, 'Enter must not start a hidden search');
    assert.match(plain(), /Enlarge terminal/);
    Object.assign(output, { columns: 110, rows: 24 }); output.emit('resize');
    await until('restored selection', () => first.test(plain()));
    // Once the list is visible again, the same row actions work.
    if (mode === 'watch-compact-keys') {
      await key('d'); await until('deleted', () => !plain().includes('a.com'));
      assert.deepEqual(deleted, ['a.com']);
    } else if (mode === 'history-compact-keys') {
      await key('d'); await until('deleted', () => !plain().includes('sample0'));
      assert.deepEqual(await historyQueries(), ['sample1', 'sample2']);
    } else {
      await key('\r'); await until('search opened', () => plain().includes('temper search acme'));
      assert.equal(lookups.length, lookupCount + 1);
    }
  }
  if (mode === 'history-hidden-list-keys') {
    Object.assign(output, { columns: 110, rows: 12 }); output.emit('resize');
    // The frame still fits, but the measured list area cannot show a row.
    await until('hidden list', () => plain().includes('Enlarge terminal to show the list'));
    assert.doesNotMatch(plain(), /Enlarge terminal to view/);
    const lookupCount = lookups.length;
    for (const value of ['j', 'd', '\r']) await key(value);
    await Bun.sleep(50); await view.waitUntilRenderFlush();
    frames.hidden = plain();
    assert.deepEqual(await historyQueries(), ['sample0', 'sample1', 'sample2']);
    assert.equal(lookups.length, lookupCount);
    assert.match(plain(), /Enlarge terminal to show the list/);
  }
  console.log(JSON.stringify({ frames }));
} finally { view.unmount(); view.cleanup(); }
