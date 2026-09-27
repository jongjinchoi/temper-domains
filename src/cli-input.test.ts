import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), "temper-input-"));
  try {
    const child = Bun.spawn([process.execPath, "--preload", "./tests/helpers/cli-input-preload.ts", "src/index.ts", ...args], {
      env: { ...process.env, TEMPER_TEST_HOME: home }, stdout: "pipe", stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, out, err, effects: await readFile(join(home, "effects"), "utf8").catch(() => "") };
  } finally { await rm(home, { recursive: true, force: true }); }
}

test.each([
  ["search", "acme", "--format", "jsn"], ["whois", "acme.com", "--format", "jsn"],
  ["whois", "www.example.com"], ["whois", "co.uk"],
  ["watch", "www.example.com"], ["watch", "co.uk"],
  ["suggest", "acme", "-p", "get,,use"], ["suggest", "acme", "-s", "app,"],
  ["suggest", "acme", "-p", "bad/"], ["suggest", "x".repeat(63)],
].map(args => ({ args })))("rejects $args before update, render or network", async ({ args }) => {
  const result = await run(args);
  expect(result.code).toBe(1);
  expect(result.err).toMatch(/invalid|empty|registrable|public suffix/i);
  expect(result.effects).toBe("");
});

test.each(["co.uk", "www.example.com"])("preserves whois JSON invalid_input for %s", async domain => {
  const result = await run(["whois", domain, "-f", "json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toMatchObject({ terminationReason: "invalid_input", attempts: 0 });
  expect(result.effects).toBe("");
});
