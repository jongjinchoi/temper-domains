import os from "node:os";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync, readFileSync } from "node:fs";
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
    const { roots } = JSON.parse(readFileSync(new URL("../../src/extensions/data/catalog.json", import.meta.url), "utf8"));
    return Response.json({ services: roots.map(tld => [[tld], [`https://${tld}.registry.test/`]]) });
  }
  if (/^https:\/\/[a-z0-9-]+\.registry\.test\/domain\//.test(url)) return new Response(null, { status: 404 });
  throw new Error(`Unexpected network request: ${url}`);
};
