import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import { createServer } from "node:http";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";

const home = process.argv[2]!;
const scenario = process.argv[3]!;
await fs.mkdir(home, { recursive: true });
os.homedir = () => home;
let bootstrapCalls = 0;
globalThis.fetch = (async () => { bootstrapCalls++; throw new Error("controlled IANA failure"); }) as unknown as typeof fetch;
const queries: string[] = [];
const sockets = new Set<net.Socket>();
const server = net.createServer(socket => {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket));
  socket.once("data", chunk => {
    const domain = chunk.toString().trim(); queries.push(domain);
    socket.end(domain.endsWith(".cr") ? "%ERROR:101: no entries found\r\n" :
      domain.endsWith(".sr") ? `Domain: ${domain}\r\nMessage: No Object Found\r\n` : "%% NOT FOUND\r\n");
  });
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as net.AddressInfo).port;
const rdapQueries: string[] = [];
const rdapServer = createServer((request, response) => { rdapQueries.push(request.url!); response.writeHead(404); response.end(); });
await new Promise<void>(resolve => rdapServer.listen(0, "127.0.0.1", resolve));
const rdapUrl = `http://127.0.0.1:${(rdapServer.address() as net.AddressInfo).port}/`;
const connect = net.createConnection;
net.createConnection = ((requestedPort: number | net.TcpNetConnectOpts, host: string | (() => void), ready: () => void) => {
  if (typeof requestedPort === "object") {
    assert.equal(requestedPort.host, "127.0.0.1");
    assert.equal(Number(requestedPort.port), (rdapServer.address() as net.AddressInfo).port);
    return Reflect.apply(connect, net, [requestedPort, host]);
  }
  assert.equal(requestedPort, 43);
  assert.ok(typeof host === "string" && ["whois.nic.cr", "whois.sr", "whois.nic.sn"].includes(host), String(host));
  return connect(port, "127.0.0.1", ready);
}) as typeof net.createConnection;
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import("bun:test");
  mock.module("node:os", () => os);
  mock.module("node:net", () => net);
}
const { checkDomainBatch } = await import("../../src/checker/batch.ts");
const { domainDetail } = await import("../../src/checker/detail.ts");
const { LimitCoordinator, MemoryLimitStore } = await import("../../src/checker/limits.ts");
type Row = import("../../src/checker/types.ts").DomainResult;
const limits = () => new LimitCoordinator(new MemoryLimitStore());
const failedBootstrap = async (): Promise<Map<string, string>> => { bootstrapCalls++; throw new Error("controlled IANA failure"); };
async function collect(source: AsyncIterable<Row>) { const rows = []; for await (const row of source) rows.push(row); return rows; }
try {
  if (scenario === "batch") {
    let summary: unknown;
    const rows = await collect(checkDomainBatch(["unused.cr", "unused.sr", "unused.sn", "unused.sn", "www.example.com"],
      { limits: limits(), onSummary: value => { summary = value; } }, failedBootstrap));
    assert.equal(bootstrapCalls, 0, "preferred-only/invalid inputs must not load IANA");
    assert.equal(rows.length, 5);
    assert.equal(rows.filter(row => row.status === "available" && row.method === "whois" && row.attempts === 1).length, 4);
    assert.equal(rows.find(row => row.domain === "www.example.com")?.terminationReason, "invalid_input");
    assert.deepEqual(queries.sort(), ["unused.cr", "unused.sn", "unused.sr"]);
    assert.ok(summary && typeof summary === "object");
    assert.deepEqual(Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "elapsedMs")),
      { requested: 5, attempted: 4, answered: 4, unresolved: 1 });
  } else if (scenario === "detail") {
    for (const tld of ["cr", "sr", "sn"]) {
      const row = await domainDetail(`unused.${tld}`, { limits: limits(), timeoutMs: 1000 });
      assert.equal(row.status, "available", JSON.stringify(row));
      assert.equal(row.method, "whois"); assert.equal(row.attempts, 1);
    }
    assert.equal(bootstrapCalls, 0);
    const dependent = await domainDetail("unused.io", { limits: limits(), timeoutMs: 1000 });
    assert.equal(dependent.terminationReason, "bootstrap_error"); assert.equal(dependent.attempts, 0);
    assert.equal(bootstrapCalls, 1); assert.equal(queries.length, 3);
  } else {
    let rejectBootstrap!: (reason: Error) => void;
    let finishBootstrap!: (map: Map<string, string>) => void;
    const waiting = new Promise<Map<string, string>>((resolve, reject) => { finishBootstrap = resolve; rejectBootstrap = reject; });
    const controller = new AbortController();
    let summary: import("../../src/checker/types.ts").CheckSummary | undefined;
    const iterator = checkDomainBatch(["unused.com", "unused.io", "unused.sn", "unused.sn"], {
      // Exercise both automatic budgeting and an explicit deadline.
      ...(scenario === "deadline" ? { timeoutMs: 500 } : {}),
      limits: limits(), concurrency: 1, signal: controller.signal, onSummary: value => { summary = value; },
    }, () => { bootstrapCalls++; return waiting; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const first = await Promise.race([iterator.next(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("preferred WHOIS waited for IANA")), 1500);
      })]);
      clearTimeout(timer);
      assert.equal(first.value?.domain, "unused.sn"); assert.equal(first.value?.status, "available");
      if (scenario === "cancel") controller.abort();
      else if (scenario === "mixed-success") finishBootstrap(new Map([["com", rdapUrl], ["io", rdapUrl]]));
      else if (scenario !== "deadline") rejectBootstrap(new Error("controlled IANA failure"));
      const rows = [first.value!, ...await collect(iterator)];
      assert.equal(bootstrapCalls, 1); assert.deepEqual(queries, ["unused.sn"]);
      assert.equal(rows.length, 4);
      for (const row of rows.filter(row => row.domain !== "unused.sn")) {
        if (scenario === "mixed-success") {
          assert.equal(row.status, "available", JSON.stringify(row)); assert.equal(row.method, "rdap"); assert.equal(row.attempts, 1);
        } else {
          assert.equal(row.attempts, 0);
          assert.equal(row.terminationReason, scenario === "cancel" ? "cancelled" : scenario === "deadline" ? "deadline_before_start" : "bootstrap_error");
        }
      }
      assert.equal(summary?.answered, scenario === "mixed-success" ? 4 : 2);
      assert.equal(summary?.unresolved, scenario === "mixed-success" ? 0 : 2);
      assert.deepEqual(rdapQueries.sort(), scenario === "mixed-success" ? ["/domain/unused.com", "/domain/unused.io"] : []);
    } finally {
      clearTimeout(timer); controller.abort(); rejectBootstrap(new Error("test cleanup"));
      await iterator.return(undefined);
    }
  }
  console.log(`PASS ${scenario}: real loopback WHOIS, no public requests`);
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));
  rdapServer.closeAllConnections();
  await new Promise<void>(resolve => rdapServer.close(() => resolve()));
}
