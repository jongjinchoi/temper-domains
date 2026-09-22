import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import React from "react";
import { render } from "ink";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const home = await mkdtemp(join(tmpdir(), "temper-node-"));
process.env.TEMPER_TEST_HOME = home;
await import("./preload.mjs");
const { isValidDomain, isValidDomainLabel, checkFullDomains, GET, addHistory, loadHistory, removeHistoryAt, loadWatchlist, SuggestView, loadConfig, saveConfig, SearchView, DEFAULT_TLDS } = await import("../../dist/test-runtime/entry.js");
after(() => rm(home, { recursive: true, force: true }));
const invalid = ["example.com/path", "example.com?x", "example.com#x", "example.com:443", "user@example.com", "%65xample.com", "example.com\\path", "foo..com", "example.com.", "example。com。", "foo。．com"];
const requests = () => readFile(join(home, "requests"), "utf8").catch(() => "");
function cli(args) {
  return spawnSync(process.execPath, ["--import", resolve("tests/runtime/preload.mjs"), "dist/npm/index.js", ...args], { encoding: "utf8", env: process.env, timeout: 10000 });
}

test("Node validation rejects URL syntax and preserves numeric and IDN labels", () => {
  for (const domain of invalid) assert.equal(isValidDomain(domain), false, domain);
  for (const domain of ["123.com", "Example.CO.UK", "bücher.de", "xn--bcher-kva.de", "例え.jp"]) assert.equal(isValidDomain(domain), true, domain);
  for (const label of ["123", "Acme", "bücher", "１２３"]) assert.equal(isValidDomainLabel(label), true, label);
  for (const label of ["acme/path", "acme?x", "acme#x", "com/path", "foo.bar", "foo。bar"]) assert.equal(isValidDomainLabel(label), false, label);
});

test("invalid CLI inputs exit before network or watchlist writes", async () => {
  const before = await requests();
  for (const domain of invalid) {
    for (const args of [["whois", domain, "--format", "json"], ["watch", domain]]) {
      const result = cli(args);
      assert.equal(result.status, 1, JSON.stringify({ args, ...result }));
      assert.match(result.stderr, /invalid/i);
    }
  }
  for (const args of [["search", "acme/path", "--format", "json"], ["search", "acme", "--tlds", "com/path", "--format", "json"]]) {
    assert.equal(cli(args).status, 1);
  }
  assert.equal(await requests(), before);
  await assert.rejects(readFile(join(home, ".temper/watchlist.json")), { code: "ENOENT" });
});

test("invalid checker inputs make no request and retain invalid_input results", async () => {
  const before = await requests();
  const rows = [];
  for await (const row of checkFullDomains(invalid)) rows.push(row);
  assert.equal(rows.length, invalid.length);
  for (const row of rows) {
    assert.equal(row.status, "error");
    assert.equal(row.terminationReason, "invalid_input");
    assert.equal(row.attempts, 0);
  }
  assert.equal(await requests(), before);
});

test("Node web API rejects invalid bare names before starting a stream or lookup", async () => {
  const before = await requests();
  for (const name of ["acme/path", "acme?x", "acme#x", "acme:80", "%61cme"]) {
    const req = new Request(`http://localhost/api/check/?name=${encodeURIComponent(name)}&tlds=com`);
    req.nextUrl = new URL(req.url);
    const response = await GET(req);
    assert.equal(response.status, 400, name);
  }
  assert.equal(await requests(), before);
});

test("Node CLI and web preserve valid numeric and IDN search results", async () => {
  for (const name of ["123", "Acme", "bücher"]) {
    const result = cli(["search", name, "--tlds", "com", "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout)[0].status, "available");
    const req = new Request(`http://localhost/api/check/?name=${encodeURIComponent(name)}&tlds=com`);
    req.nextUrl = new URL(req.url);
    const response = await GET(req);
    assert.equal(response.status, 200);
    const rows = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(rows[0].status, "available");
    assert.equal(rows.at(-1).done, true);
  }
});

test("Node MCP rejects invalid full domains without querying registries", async () => {
  const client = new Client({ name: "temper-node-regression", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", resolve("tests/runtime/preload.mjs"), resolve("dist/npm/index.js"), "mcp"], env: process.env });
  try {
    await client.connect(transport);
    const before = await requests();
    for (const domain of invalid.slice(0, 3)) {
      const detail = await client.callTool({ name: "whois_domain", arguments: { domain } });
      assert.equal(detail.isError, true);
      const batch = await client.callTool({ name: "check_domain_availability", arguments: { domains: [domain] } });
      assert.match(JSON.stringify(batch.content), /invalid|Invalid/);
      assert.doesNotMatch(JSON.stringify(batch.content), /1 available/);
    }
    assert.equal(await requests(), before);
    const valid = await client.callTool({ name: "whois_domain", arguments: { domain: "123.com" } });
    assert.notEqual(valid.isError, true);
    assert.match(JSON.stringify(valid.content), /Status: available/);
  } finally { await client.close(); }
});

test("a legacy watchlist containing URL syntax is preserved for repair", async () => {
  const file = join(home, ".temper/watchlist.json");
  await mkdir(join(home, ".temper"), { recursive: true });
  const content = JSON.stringify([{ domain: "example.com/path", addedAt: "2026-09-20T00:00:00Z" }]);
  await writeFile(file, content);
  await assert.rejects(loadWatchlist(), /repair/);
  assert.equal(await readFile(file, "utf8"), content);
});

test("Node history writers preserve additions and reject deletion from an old snapshot", async () => {
  const jobs = ["first", "second"].map(query => new Promise((done, reject) => {
    const script = `import { addHistory } from './dist/test-runtime/entry.js'; await addHistory({query: ${JSON.stringify(query)}, timestamp: '2026-09-20T00:00:00Z', available: 1, total: 1});`;
    const child = spawn(process.execPath, ["--import", resolve("tests/runtime/preload.mjs"), "--input-type=module", "-e", script], { env: process.env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? done() : reject(new Error(stderr)));
  }));
  await Promise.all(jobs);
  const snapshot = await loadHistory();
  assert.deepEqual(snapshot.map(e => e.query).sort(), ["first", "second"]);
  await addHistory({ query: "new", timestamp: "2026-09-20T00:00:00Z", available: 1, total: 1 });
  await assert.rejects(removeHistoryAt(0, snapshot), /History changed/);
  assert.equal((await loadHistory()).length, 3);
});

test("Node renders uppercase suggestion rows after completion", async () => {
  let frame = "";
  const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
  Object.assign(output, { columns: 110, rows: 40, isTTY: true });
  const input = new PassThrough();
  Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const view = render(React.createElement(SuggestView, { query: "Acme", prefixes: ["Get"], suffixes: ["App"] }), {
    stdout: output, stderr: output, stdin: input, debug: true, patchConsole: false, exitOnCtrlC: false,
  });
  try {
    const deadline = Date.now() + 3000;
    while (!frame.includes("3 names checked") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    const text = frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    assert.match(text, /3 names checked/);
    for (const name of ["Acme", "GetAcme", "AcmeApp"]) assert.match(text, new RegExp(`${name}\\s+.*available`));
    assert.doesNotMatch(text, /checking/);
  } finally { view.unmount(); view.cleanup(); }
});


function configProcess(partial) {
  return new Promise((done, reject) => {
    const script = `import { saveConfig } from './dist/test-runtime/entry.js'; await saveConfig(${JSON.stringify(partial)});`;
    const child = spawn(process.execPath, ["--import", resolve("tests/runtime/preload.mjs"), "--input-type=module", "-e", script], { env: process.env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? done() : reject(new Error(stderr)));
  });
}

test("Node concurrent config updates preserve both fields while readers see complete settings", async () => {
  const file = join(home, ".temper/config.json");
  let reads = 0;
  for (let round = 0; round < 5; round++) {
    await writeFile(file, JSON.stringify({ theme: "temper-forge", registrar: "cloudflare", extra: "keep" }));
    let finished = false;
    const writers = Promise.all([configProcess({ theme: "dracula" }), configProcess({ registrar: "namecheap" })]);
    const settled = writers.finally(() => { finished = true; });
    try {
      while (!finished) {
        const config = await loadConfig();
        assert.ok(["temper-forge", "dracula"].includes(config.theme));
        assert.ok(["cloudflare", "namecheap"].includes(config.registrar));
        assert.equal(config.extra, "keep");
        reads++;
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    } finally { await settled; }
    assert.deepEqual(await loadConfig(), { theme: "dracula", registrar: "namecheap", extra: "keep" });
  }
  assert.ok(reads > 0);
  assert.equal(cli(["config", "theme", "--list"]).status, 0);
  assert.equal(cli(["search", "acme", "--tlds", "com", "--format", "json"]).status, 0);
  const client = new Client({ name: "temper-config-regression", version: "1.0.0" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", resolve("tests/runtime/preload.mjs"), resolve("dist/npm/index.js"), "mcp"], env: process.env }));
    assert.ok((await client.listTools()).tools.length > 0);
  } finally { await client.close(); }
});

test("Node preserves malformed config on save failure", async () => {
  const file = join(home, ".temper/config.json");
  await writeFile(file, "{");
  try {
    await assert.rejects(saveConfig({ theme: "dracula" }), /repair/);
    assert.equal(await readFile(file, "utf8"), "{");
  } finally { await writeFile(file, JSON.stringify({ theme: "temper-forge", registrar: "cloudflare" })); }
});

test("Node SearchView shows a filtered match immediately after scrolling at 24 rows", async () => {
  const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  let frame = "";
  const output = new Writable({ write(chunk, _encoding, callback) { frame = String(chunk); callback(); } });
  Object.assign(output, { columns: 110, rows: 24, isTTY: true });
  const input = new PassThrough();
  Object.assign(input, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const view = render(React.createElement(SearchView, { query: "Acme", tlds: DEFAULT_TLDS }), {
    stdout: output, stderr: output, stdin: input, debug: true, patchConsole: false, exitOnCtrlC: false,
  });
  const text = () => frame.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const key = async value => { input.write(value); await new Promise(resolve => setTimeout(resolve, 60)); };
  try {
    const deadline = Date.now() + 5000;
    while (!frame.includes("Search complete") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.match(text(), /30\/30 answered/);
    for (let i = 0; i < 20; i++) await key("j");
    assert.match(text(), /↑ 5 more/);
    await key("/"); await key("com");
    assert.match(text(), /1 of 30 matches/);
    assert.match(text(), /acme\.com/);
    assert.doesNotMatch(text(), /↑|↓/);
    await key("\r");
    assert.match(text(), /▸\s+acme\.com/);
    await key("/"); await key("zzz");
    assert.match(text(), /0 of 30 matches/);
    await key("\r");
    await key("j"); await key("k"); await key("\r");
    assert.doesNotMatch(text(), /▸|Where to buy/);
  } finally {
    view.unmount(); view.cleanup();
    if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else delete process.stdin.isTTY;
  }
});


test("Node catalog pages are offline and composite CLI selection sends only selected domains", async () => {
  const before = await requests();
  const seen = [];
  let cursor;
  do {
    const result = cli(["extensions", "--format", "json", "--limit", "100", ...(cursor ? ["--cursor", cursor] : [])]);
    assert.equal(result.status, 0, result.stderr);
    const page = JSON.parse(result.stdout);
    assert.equal(page.total, 756);
    seen.push(...page.items.map(e => e.suffix));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 756);
  assert.equal(new Set(seen).size, 756);
  assert.equal(await requests(), before);
  for (const options of [["--tlds", "com,co.uk,uk", "--extended"], ["--category", "design-arts"]]) {
    const result = cli(["search", "nodechoice", ...options, "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    const domains = JSON.parse(result.stdout).map(e => e.domain);
    if (options[0] === "--tlds") assert.deepEqual(domains.sort(), ["nodechoice.co.uk", "nodechoice.com", "nodechoice.uk"]);
    else { assert.ok(domains.includes("nodechoice.design")); assert.ok(!domains.includes("nodechoice.com")); }
  }
  const current = await requests();
  for (const args of [["search", ...Array.from({ length: 53 }, (_, i) => `limit${i}`), "--category", "technology", "--format", "json"], ["search", "x", "--category", "design-arts", "--extended"], ["search", "x", "--tld-preset", "tech"], ["show-presets"]]) assert.equal(cli(args).status, 1);
  assert.equal(await requests(), current);
});

test("Node MCP exposes catalog and selected suffix schemas and preserves composite results", async () => {
  const client = new Client({ name: "temper-node-extensions", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", resolve("tests/runtime/preload.mjs"), resolve("dist/npm/index.js"), "mcp"], env: process.env });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.find(t => t.name === "search_domain").inputSchema.properties.tlds);
    const before = await requests();
    for (const args of [undefined, {}]) {
      const result = await client.callTool({ name: "list_supported_tlds", ...(args ? { arguments: args } : {}) });
      assert.equal(result.structuredContent.discovery.total, 756);
      assert.equal(result.structuredContent.extended.count, 60);
      assert.equal(result.structuredContent.additional.count, 30);
      assert.ok(result.structuredContent.extended.tlds.includes("design"));
    }
    assert.equal(await requests(), before);
    const selected = await client.callTool({ name: "search_names", arguments: { names: ["nodesingle", "nodesecond"], tlds: ["co.uk", "uk"] } });
    assert.notEqual(selected.isError, true);
    const text = JSON.stringify(selected.content);
    for (const name of ["nodesingle", "nodesecond"]) for (const suffix of ["co.uk", "uk"]) assert.ok(text.includes(`${name}.${suffix}`));
    assert.match(text, /4 requested/);
    assert.doesNotMatch(text, /nodesingle.com/);
  } finally { await client.close(); }
});
