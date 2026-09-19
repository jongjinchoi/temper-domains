import os from "node:os";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.TEMPER_TEST_HOME;
if (!home) throw new Error("TEMPER_TEST_HOME is required");
os.homedir = () => home;
net.createConnection = () => { throw new Error("Unexpected WHOIS connection in runtime test"); };
syncBuiltinESMExports();
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("data:")) return nativeFetch(input);
  appendFileSync(join(home, "requests"), url + "\n");
  if (url === "https://data.iana.org/rdap/dns.json") {
    return Response.json({ services: [[["com", "de", "uk"], ["https://registry.test/"]]] });
  }
  if (url.startsWith("https://registry.test/domain/")) return new Response(null, { status: 404 });
  throw new Error(`Unexpected network request: ${url}`);
};
