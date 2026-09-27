import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import tls from "node:tls";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

const home = process.argv[2]!;
const original = { ...fs };
const statePath = join(home, "limits.json");
const cacheDir = join(home, ".temper/cache");
await original.mkdir(cacheDir, { recursive: true });
await original.writeFile(join(cacheDir, "rdap-dns.json"), JSON.stringify({ version: 1, headers: {}, freshUntil: Date.now() + 60000,
  data: { services: [[["com"], ["https://rdap.test/"]]] } }));
let injected = 0;
let network = 0;
let failure = "close";
const changed = { ...original,
  open: async (...args: Parameters<typeof fs.open>) => {
    const handle = await original.open(...args);
    if (String(args[0]) === statePath + ".lock") {
      if (failure === "pid") handle.writeFile = async () => { injected++; throw new Error("PID storage failed"); };
      else {
        const close = handle.close.bind(handle);
        handle.close = async () => { await close(); injected++; throw new Error("lookup cleanup failed"); };
      }
    }
    return handle;
  },
};
Object.assign(fs, changed);
os.homedir = () => home;
net.createConnection = (() => { network++; throw new Error("Unexpected WHOIS connection"); }) as typeof net.createConnection;
tls.connect = (() => { network++; throw new Error("Unexpected RDAP connection"); }) as typeof tls.connect;
globalThis.fetch = (() => { network++; throw new Error("Unexpected fetch"); }) as unknown as typeof fetch;
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import("bun:test");
  mock.module("node:fs/promises", () => changed);
  mock.module("node:os", () => os);
  mock.module("node:net", () => net);
  mock.module("node:tls", () => tls);
}
const { FileLimitStore } = await import("../../src/checker/limit-store.ts");
const { LimitCoordinator } = await import("../../src/checker/limits.ts");
const { createRun } = await import("../../src/checker/run.ts");
const { lookupDomainAvailability } = await import("../../src/checker/lookup.ts");
const { domainDetail } = await import("../../src/checker/detail.ts");
const rows = [];
for (failure of ["close", "pid"]) for (const detail of [false, true]) for (const method of ["rdap", "whois"]) {
  const domain = method === "rdap" ? "acme.com" : "acme.sn";
  const key = method === "rdap" ? "https://rdap.test" : "whois://whois.nic.sn:43";
  const until = Date.now() + 60000;
  await original.writeFile(statePath, JSON.stringify({ version: 2, servers: { [key]: {
    generation: 0, observedAt: 0, strikes: 1, blockedUntil: until, nextStart: 0,
    source: "server", kind: "rate_limited", leases: [], recovery: true, level: 2, successes: 0,
  } } }));
  const limits = new LimitCoordinator(new FileLimitStore(statePath));
  const run = createRun(1000, undefined, 1, 1000, limits);
  try {
    const row = detail ? await domainDetail(domain, { limits, timeoutMs: 1000 })
      : await lookupDomainAvailability(domain, method === "rdap" ? "https://rdap.test/" : null, run.signal, 1000, undefined, run.context);
    rows.push({ failure, detail, method, until, row });
  } finally { run.close(); }
}
console.log(JSON.stringify({ rows, injected, network, lock: await original.stat(statePath + ".lock").then(() => true, () => false) }));
