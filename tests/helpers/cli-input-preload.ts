import "./home.ts";
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
if (homedir() !== process.env.TEMPER_TEST_HOME) throw new Error('Home isolation failed');
const mark = (value: string) => appendFileSync(`${process.env.TEMPER_TEST_HOME}/effects`, value + "\n");
mock.module("../../src/update/cli.ts", () => ({ maybeUpdate: async () => { mark("update"); return false; }, updateCommand: async () => {} }));
mock.module("ink", () => ({ render: () => { mark("render"); return { waitUntilExit: async () => {} }; } }));
// Avoid loading component imports; this test checks the real command's preflight.
for (const name of ["App", "WhoisView", "SuggestView"]) mock.module(`../../src/tui/${name}.tsx`, () => ({ default: () => null }));
mock.module("node:net", () => ({ ...net, createConnection: () => { mark("network"); throw new Error("Network forbidden"); } }));
globalThis.fetch = Object.assign(async () => { mark("network"); throw new Error("Network forbidden"); }, { preconnect() {} });
// Observe the real CLI's converted argument without imposing a 1ms I/O deadline.
if (process.env.TEMPER_TEST_TIMEOUT_INPUT === '1') {
  mock.module('../../src/checker/checker.ts', () => ({ checkDomains: async function* (_query: string, _tlds: unknown, options: { timeoutMs?: number }) {
    mark(JSON.stringify({ command: 'search', timeoutMs: options.timeoutMs ?? null }));
  } }));
  mock.module('../../src/checker/detail.ts', () => ({ domainDetail: async (_domain: string, options: { timeoutMs?: number }) => {
    mark(JSON.stringify({ command: 'whois', timeoutMs: options.timeoutMs ?? null }));
    return {};
  } }));
}
