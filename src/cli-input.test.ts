import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run(args: string[], observeTimeout = false) {
  const home = await mkdtemp(join(tmpdir(), "temper-input-"));
  try {
    const child = Bun.spawn([process.execPath, "--preload", "./tests/helpers/cli-input-preload.ts", "src/index.ts", ...args], {
      env: { ...process.env, HOME: home, TEMPER_TEST_HOME: home, TEMPER_TEST_TIMEOUT_INPUT: observeTimeout ? "1" : "" }, stdout: "pipe", stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const stateFiles = await readdir(join(home, '.temper'), { recursive: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return { code, out, err, stateFiles, effects: await readFile(join(home, "effects"), "utf8").catch(() => "") };
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

for (const command of ['search', 'whois']) {
  const base = command === 'search' ? ['search', 'acme'] : ['whois', 'acme.com'];
  test.each(['2147483.648', '1e308', 'Infinity', 'NaN', '0', '-1', '0.0001'])(`${command} rejects invalid timeout %s before side effects`, async seconds => {
    for (const format of ['tui', 'json']) {
      const result = await run([...base, '--format', format, '--timeout', seconds]);
      expect(result.code).toBe(1);
      expect(result.err).toMatch(/invalid --timeout/);
      expect(result.effects).toBe('');
      expect(result.stateFiles).toEqual([]);
    }
  });
  test.each([
    { seconds: '3', ms: 3000 }, { seconds: '2147483.647', ms: 2147483647 },
    { seconds: '0.0005', ms: 1 }, { seconds: '0.0009', ms: 1 },
    { seconds: '1.2345', ms: 1235 }, { seconds: undefined, ms: command === 'search' ? null : 10000 },
  ])(`${command} forwards valid timeout $seconds after rounding`, async ({ seconds, ms }) => {
    const result = await run([...base, '--format', 'json', ...(seconds === undefined ? [] : ['--timeout', seconds])], true);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(JSON.parse(result.effects)).toEqual({ command, timeoutMs: ms });
    expect(result.stateFiles).toEqual([]);
  });
}

test.each(["co.uk", "www.example.com"])("preserves whois JSON invalid_input for %s", async domain => {
  const result = await run(["whois", domain, "-f", "json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out)).toMatchObject({ terminationReason: "invalid_input", attempts: 0 });
  expect(result.effects).toBe("");
});
