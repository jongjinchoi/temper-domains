import "./home.ts";
import { mock } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { supportedEntries } from "../../src/extensions/catalog.ts";

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  appendFileSync(join(process.env.TEMPER_TEST_HOME!, "requests"), `${String(input)}\n`);
  if (String(input) === "https://data.iana.org/rdap/dns.json") {
    return Response.json({ services: [...new Set([...supportedEntries.map(e => e.rootTld), "xn--p1ai"])].map((tld) => [[tld], [`https://${tld}.test/`]]) });
  }
  if (String(input).includes("/domain/hold.com")) return new Promise<Response>((_, reject) => {
    writeFileSync(join(process.env.TEMPER_TEST_HOME!, "lookup-started"), "yes");
    init?.signal?.addEventListener("abort", () => {
      writeFileSync(join(process.env.TEMPER_TEST_HOME!, "lookup-cancelled"), "yes");
      reject(init.signal!.reason);
    }, { once: true });
  });
  return String(input).includes("/domain/taken.")
    ? Response.json({ objectClassName: "domain", ldhName: decodeURIComponent(String(input).split("/domain/")[1]!), status: ["active"] })
    : new Response(null, { status: 404 });
}) as typeof fetch;
mock.module("../../src/registrar/browser.ts", () => ({
  openBrowser: (url: string) => writeFileSync(join(process.env.TEMPER_TEST_HOME!, "opened-url"), url),
}));
const { startMcpServer } = await import("../../src/mcp/server.ts");
await startMcpServer();
