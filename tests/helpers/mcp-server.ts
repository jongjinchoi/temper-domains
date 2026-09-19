import "./home.ts";
import { mock } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXTENDED_TLDS } from "../../src/checker/types.ts";

globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  if (String(input) === "https://data.iana.org/rdap/dns.json") {
    return Response.json({ services: EXTENDED_TLDS.map((tld) => [[tld], [`https://${tld}.test/`]]) });
  }
  return String(input).includes("/domain/taken.")
    ? Response.json({ ldhName: "taken.com", status: ["active"] })
    : new Response(null, { status: 404 });
}) as typeof fetch;
mock.module("../../src/registrar/browser.ts", () => ({
  openBrowser: (url: string) => writeFileSync(join(process.env.TEMPER_TEST_HOME!, "opened-url"), url),
}));
const { startMcpServer } = await import("../../src/mcp/server.ts");
await startMcpServer();
