import "./home.ts";
import "./mock-rdap-transport.ts";
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
const mark = (value: string) => appendFileSync(`${process.env.TEMPER_TEST_HOME}/effects`, value + "\n");
mock.module("../../src/update/cli.ts", () => ({ maybeUpdate: async () => { mark("update"); return false; }, updateCommand: async () => {} }));
mock.module("ink", () => ({ render: () => { mark("render"); return { waitUntilExit: async () => {} }; } }));
globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
  const url = String(input);
  if (url === "https://data.iana.org/rdap/dns.json") return Response.json({ services: [[["com", "dev"], ["https://rdap.test/"]]] });
  mark(`lookup ${url.split("/domain/")[1]}`);
  if (url.endsWith("/domain/taken.com")) return Response.json({ objectClassName: "domain", ldhName: "taken.com", status: ["active"],
    events: [{ eventAction: "expiration", eventDate: "2027-06-01T00:00:00Z" }],
    entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]] }] });
  return new Response(null, { status: 404 });
}, { preconnect() {} });
