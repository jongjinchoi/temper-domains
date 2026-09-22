import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchLatestVersion, parseBrewInfo, parseFormulaVersion } from "./versions.ts";
import { runProcess, withInstallLock } from "./process.ts";

const directories: string[] = [];
async function temporary() { const dir = await mkdtemp(join(tmpdir(), "temper-updater-")); directories.push(dir); return dir; }
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

test("release lookup uses each installation channel and rejects invalid responses", async () => {
  const urls: string[] = [];
  const request = (async (url: string | URL | Request) => { urls.push(String(url)); return new Response(JSON.stringify({ name: "temper-domains", version: "0.5.0" })); }) as typeof fetch;
  expect(await fetchLatestVersion("npm", AbortSignal.timeout(1000), request)).toBe("0.5.0");
  expect(urls).toEqual(["https://registry.npmjs.org/temper-domains/latest"]);
  const brewRequest = (async (url: string | URL | Request) => { urls.push(String(url)); return new Response('class Temper < Formula\n  version "0.6.0"\nend\n'); }) as typeof fetch;
  expect(await fetchLatestVersion("homebrew", AbortSignal.timeout(1000), brewRequest)).toBe("0.6.0");
  expect(urls[1]).toContain("jongjinchoi/homebrew-temper-domains/");
  for (const response of [new Response("oops"), new Response("{}", { status: 503 }), new Response(JSON.stringify({ name: "other", version: "0.6.0" })), new Response(JSON.stringify({ name: "temper-domains", version: "0.6.0-beta" }))]) {
    await expect(fetchLatestVersion("npm", AbortSignal.timeout(1000), async () => response)).rejects.toThrow();
  }
});

test("Homebrew metadata must identify the expected tap and one stable version", () => {
  expect(parseFormulaVersion('class Temper < Formula\n version "1.2.3"\nend')).toBe("1.2.3");
  expect(() => parseFormulaVersion('version "1.2.3"\nversion "2.0.0"')).toThrow();
  const formula = { name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: true, versions: { stable: "0.5.0" }, installed: [{ version: "0.4.1" }] };
  expect(parseBrewInfo(JSON.stringify({ formulae: [formula] })).pinned).toBe(true);
  expect(() => parseBrewInfo(JSON.stringify({ formulae: [{ ...formula, tap: "other/tap" }] }))).toThrow();
});

test("child processes preserve arguments and distinguish failure and cancellation", async () => {
  const result = await runProcess({ file: process.execPath, args: ["-e", "console.log(process.argv[1])", "a; $(not-a-command)"] });
  expect(result.stdout.trim()).toBe("a; $(not-a-command)");
  await expect(runProcess({ file: process.execPath, args: ["-e", "process.exit(7)"] })).rejects.toThrow("7");
  await expect(runProcess({ file: join(await temporary(), "missing"), args: [] })).rejects.toThrow();
  await expect(runProcess({ file: process.execPath, args: ["-e", "setTimeout(()=>{},10000)"] }, { signal: AbortSignal.timeout(30) })).rejects.toThrow();
});

test("only one updater can hold an installation lock and failures release it", async () => {
  const dir = await temporary();
  await withInstallLock(dir, "install-a", async () => {
    await expect(withInstallLock(dir, "install-a", async () => {})).rejects.toThrow("already");
  });
  await expect(withInstallLock(dir, "install-a", async () => { throw new Error("failed install"); })).rejects.toThrow("failed install");
  expect(await withInstallLock(dir, "install-a", async () => 42)).toBe(42);
});
