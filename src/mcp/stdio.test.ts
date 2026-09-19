import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
    "check_domain_availability", "open_registrar", "search_domain", "search_names", "suggest_domain", "whois_domain",
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

test("all six stdio tools preserve their successful results", async () => {
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
