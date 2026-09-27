import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
let injected = 0;
if (process.env.TEMPER_TEST_FAIL_LOCK_CLOSE) {
  const original = { ...fs };
  mock.module("node:fs/promises", () => ({ ...original, open: async (...args: Parameters<typeof fs.open>) => {
    const file = await original.open(...args);
    if (!String(args[0]).endsWith(".lock")) return file;
    const close = file.close.bind(file);
    file.close = async () => { await close(); injected++; throw new Error("test lock close failed"); };
    return file;
  } }));
}
if (process.env.TEMPER_TEST_FAIL_RENAME) {
  mock.module("node:fs/promises", () => ({ ...fs, rename: async () => { throw new Error("test rename failed"); } }));
}
const { addWatch, removeWatch } = await import("../../src/config/watchlist.ts");
const { saveConfig } = await import("../../src/config/config.ts");
const { addHistory } = await import("../../src/config/history.ts");

const [operation, domain, gate] = process.argv.slice(2);
if (gate) {
  const { access } = await import("node:fs/promises");
  while (true) {
    try { await access(gate); break; } catch { await Bun.sleep(5); }
  }
}
try {
  if (operation === "config") await saveConfig({ theme: "seoul-night" });
  else if (operation === "history") await addHistory({ query: "acme", timestamp: new Date().toISOString(), available: 1, total: 1 });
  else if (operation === "remove") await removeWatch(domain!);
  else await addWatch(domain!);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
if (process.env.TEMPER_TEST_FAIL_LOCK_CLOSE && injected !== 1) throw new Error(`Injection count: ${injected}`);
