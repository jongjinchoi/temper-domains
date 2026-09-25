import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DEFAULT_TLDS, EXTENDED_TLDS } from "../checker/types.ts";

let home: string;
const client = new Client({ name: "temper-regression", version: "1.0.0" });
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "temper-mcp-"));
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dir, "../../tests/helpers/mcp-server.ts")],
    env: { ...process.env, TEMPER_TEST_HOME: home } as Record<string, string>,
  }));
});
afterAll(async () => { await client.close(); await rm(home, { recursive: true, force: true }); });

test("stdio tool schemas reject invalid input while preserving error responses", async () => {
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    "check_domain_availability", "list_supported_tlds", "open_registrar", "search_domain", "search_names", "suggest_domain", "whois_domain",
  ]);
  for (const [name, args] of [
    ["search_domain", { name: "acme.com" }],
    ["search_names", { names: [] }],
    ["search_names", { names: Array(9).fill("acme") }],
    ["check_domain_availability", { domains: ["acme"] }],
    ["check_domain_availability", { domains: Array(101).fill("acme.com") }],
    ["open_registrar", { domain: "acme.com", registrar: "invalid" }],
  ] as const) {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).toBe(true);
  }
});

test("lookup tools return validated structured results alongside the original text", async () => {
  const { tools } = await client.listTools();
  expect(tools.find(t => t.name === "check_domain_availability")!.inputSchema.properties).toHaveProperty("resume");
  for (const [name, args] of [
    ["search_domain", { name: "structured", tlds: ["com"] }],
    ["search_names", { names: ["structured"], tlds: ["net"] }],
    ["check_domain_availability", { domains: ["structured.dev"], resume: true }],
  ] as const) {
    expect(tools.find(t => t.name === name)!.outputSchema).toBeDefined();
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).not.toBe(true);
    const payload = response.structuredContent as any;
    expect(payload).toMatchObject({ schemaVersion: 1, summary: { requested: 1, answered: 1, unresolved: 0 }, retryPlan: { eligible: [], deferred: [], maxPerCall: 100, requiresUserRequest: true } });
    expect(payload.rows[0].status).toBe("available");
    expect(JSON.parse((response.content as { text: string }[])[1]!.text)).toEqual(payload);
  }
});

test("supported TLD discovery returns the search catalog without network lookups", async () => {
  const { tools } = await client.listTools();
  const tool = tools.find((tool) => tool.name === "list_supported_tlds");
  expect(tool).toBeDefined();
  expect(tool!.inputSchema.properties).toHaveProperty("view");
  expect(tool!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  expect(client.getInstructions()).toContain("Use list_supported_tlds");
  const requests = () => readFile(join(home, "requests"), "utf8").catch(() => "");
  const before = await requests();
  for (const args of [undefined, {}]) {
    const response = await client.callTool({ name: "list_supported_tlds", ...(args ? { arguments: args } : {}) });
    expect(response.isError).not.toBe(true);
    const catalog = response.structuredContent as {
      default: { count: number; tlds: string[] };
      additional: { count: number; tlds: string[] };
      extended: { count: number; tlds: string[] };
      usage: string;
    };
    expect(catalog.default).toEqual({ count: DEFAULT_TLDS.length, tlds: [...DEFAULT_TLDS] });
    expect(catalog.extended).toEqual({ count: EXTENDED_TLDS.length, tlds: [...EXTENDED_TLDS] });
    expect(catalog.additional.count).toBe(catalog.additional.tlds.length);
    expect([...catalog.default.tlds, ...catalog.additional.tlds]).toEqual(catalog.extended.tlds);
    expect(new Set(catalog.extended.tlds).size).toBe(catalog.extended.count);
    expect(catalog.usage).toContain("extended=true");
    expect(catalog.usage).toContain("includes the default");
    expect(catalog.usage).toContain("not a list of all");
    expect(catalog.usage).toContain("not checked");
    const content = response.content as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text)).toEqual(catalog);
  }
  expect(await requests()).toBe(before);
});

test("MCP discovery filters the shared catalog without lookups and rejects irrelevant options", async () => {
  const requests = () => readFile(join(home, "requests"), "utf8").catch(() => "");
  const before = await requests();
  const response = await client.callTool({ name: "list_supported_tlds", arguments: { view: "extensions", query: "co.uk" } });
  expect(response.isError).not.toBe(true);
  expect(JSON.stringify(response.structuredContent)).toContain('"suffix":"co.uk"');
  for (const arguments_ of [{ view: "presets", query: "co.uk" }, { view: "categories", industries: ["design-arts"] }, { view: "extensions", limit: 101 }]) {
    expect((await client.callTool({ name: "list_supported_tlds", arguments: arguments_ })).isError).toBe(true);
  }
  expect(await requests()).toBe(before);
});

test("selected MCP search queries exactly the requested full domains and retains every outcome", async () => {
  const response = await client.callTool({ name: "search_names", arguments: { names: ["selection", "taken"], tlds: ["co.uk", "design", "uk"] } });
  expect(response.isError).not.toBe(true);
  const text = (response.content as { text: string }[])[0]!.text;
  for (const name of ["selection", "taken"]) for (const suffix of ["co.uk", "design", "uk"]) expect(text).toContain(`${name}.${suffix}`);
  expect(text.indexOf("selection.co.uk")).toBeLessThan(text.indexOf("selection.design"));
  expect(text).toContain("6 requested");
  expect(text).not.toContain("selection.com");
  const log = await readFile(join(home, "requests"), "utf8");
  const domains = log.split("\n").filter(url => url.includes("/domain/selection.")).map(url => url.split("/domain/")[1]).sort();
  expect(domains).toEqual(["selection.co.uk", "selection.design", "selection.uk"]);
  const before = log;
  for (const args of [{ name: "selection", tlds: ["design"], extended: false }, { name: "selection", tld: ["design"] }, { name: "selection", tlds: ["design", "invalid/path"] }]) {
    expect((await client.callTool({ name: "search_domain", arguments: args })).isError).toBe(true);
  }
  expect(await readFile(join(home, "requests"), "utf8")).toBe(before);
});

test("availability and registrar stdio tools preserve their successful results", async () => {
  const cases = [
    ["search_domain", { name: "Acme" }, "30 available"],
    ["search_names", { names: ["acme", "taken"] }, "30 taken"],
    ["suggest_domain", { name: "acme" }, "75/75 available"],
    ["check_domain_availability", { domains: ["taken.com", "free.dev"] }, "1 available, 1 taken"],
    ["whois_domain", { domain: "taken.com" }, "Status: taken"],
    ["open_registrar", { domain: "Acme.com", registrar: "porkbun" }, "https://porkbun.com/checkout/search?q=acme.com"],
  ] as const;
  for (const [name, args, expected] of cases) {
    const response = await client.callTool({ name, arguments: args });
    expect(response.isError).not.toBe(true);
    const content = response.content as { type: string; text?: string }[];
    expect(content.map((item) => item.text ?? "").join("\n")).toContain(expected);
  }
  expect(await readFile(join(home, "opened-url"), "utf8")).toBe("https://porkbun.com/checkout/search?q=acme.com");
}, 20000);


test("MCP cancellation reaches the lookup without cancelling another request", async () => {
  const controller = new AbortController();
  const pending = client.callTool({ name: "check_domain_availability", arguments: { domains: ["hold.com"] } }, undefined, { signal: controller.signal });
  const rejected = pending.catch(() => undefined);
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await readFile(join(home, "lookup-started"), "utf8").catch(() => "")) break;
    await Bun.sleep(10);
  }
  expect(await readFile(join(home, "lookup-started"), "utf8")).toBe("yes");
  const other = client.callTool({ name: "check_domain_availability", arguments: { domains: ["other.com"] } });
  controller.abort();
  await rejected;
  const response = await other;
  expect(JSON.stringify(response.content)).toContain("1 available");
  expect(await readFile(join(home, "lookup-cancelled"), "utf8")).toBe("yes");
});


test("single-name selected search preserves suffix order without default grouping", async () => {
  const response = await client.callTool({ name: "search_domain", arguments: { name: "single", tlds: ["world", "co.uk", "com"] } });
  expect(response.isError).not.toBe(true);
  const text = (response.content as { text: string }[])[0]!.text;
  expect(text.indexOf("single.world")).toBeLessThan(text.indexOf("single.com"));
  expect(text).toContain("single.co.uk");
  expect(text).toContain("Selected extensions:");
  expect(text).not.toContain("Default TLDs:");
});

test("MCP lists every supported extension offline with exhaustive cursor pages", async () => {
  const before = await readFile(join(home, "requests"), "utf8").catch(() => "");
  const all: string[] = [];
  let cursor: string | undefined;
  do {
    const response = await client.callTool({ name: "list_supported_tlds", arguments: { view: "extensions", limit: 100, ...(cursor ? { cursor } : {}) } });
    expect(response.isError).not.toBe(true);
    const page = response.structuredContent as { total: number; items: { suffix: string }[]; nextCursor: string | null };
    expect(page.total).toBe(756);
    all.push(...page.items.map(e => e.suffix));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(all).toHaveLength(756);
  expect(new Set(all).size).toBe(756);
  expect(await readFile(join(home, "requests"), "utf8").catch(() => "")).toBe(before);
});

test("extended searches send the approved 60 domains and selected searches accept 480 but reject overflow before lookup", async () => {
  const extended = await client.callTool({ name: "search_domain", arguments: { name: "bundlecheck", extended: true } });
  expect(extended.isError).not.toBe(true);
  const log = await readFile(join(home, "requests"), "utf8");
  const queried = log.split("\n").filter(url => url.includes("/domain/bundlecheck.")).map(url => url.split("/domain/")[1]!.replace("bundlecheck.", ""));
  expect(queried.sort()).toEqual([...EXTENDED_TLDS].sort());
  expect(queried).toContain("biz");
  expect(queried).toContain("asia");
  expect(queried).toContain("design");
  expect(queried).not.toContain("sh");
  const names = ["onecap", "twocap", "threecap", "fourcap", "fivecap", "sixcap", "sevencap", "eightcap"];
  const selected = await client.callTool({ name: "search_names", arguments: { names, tlds: [...EXTENDED_TLDS] } });
  expect(selected.isError).not.toBe(true);
  const text = (selected.content as { text: string }[])[0]!.text;
  expect(text).toContain("480 requested");
  for (const name of names) for (const suffix of EXTENDED_TLDS) expect(text).toContain(`${name}.${suffix}`);
  const before = await readFile(join(home, "requests"), "utf8");
  const overflow = await client.callTool({ name: "search_names", arguments: { names, tlds: [...EXTENDED_TLDS, "page"] } });
  expect(overflow.isError).toBe(true);
  expect(JSON.stringify(overflow.content)).toMatch(/488.*480/);
  expect(await readFile(join(home, "requests"), "utf8")).toBe(before);
}, 20000);


test("selected MCP accepts an IDN suffix and a technically supported suffix outside the catalog", async () => {
  const response = await client.callTool({ name: "search_domain", arguments: { name: "idnselection", tlds: ["在线", "ac.me"] } });
  expect(response.isError).not.toBe(true);
  const text = (response.content as { text: string }[])[0]!.text;
  expect(text).toContain("idnselection.xn--3ds443g");
  expect(text).toContain("idnselection.ac.me");
  expect(text).toContain("2 requested");
  const log = await readFile(join(home, "requests"), "utf8");
  const domains = log.split("\n").filter(url => url.includes("/domain/idnselection.")).map(url => url.split("/domain/")[1]).sort();
  expect(domains).toEqual(["idnselection.ac.me", "idnselection.xn--3ds443g"]);
});
