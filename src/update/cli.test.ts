import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function cli(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), "temper-update-cli-"));
  try {
  const child = Bun.spawn([process.execPath, "--preload", "./tests/helpers/home.ts", "src/index.ts", ...args], { env: { ...process.env, TEMPER_TEST_HOME: home, TEMPER_NO_UPDATE_CHECK: "1" }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
  } finally { await rm(home, { recursive: true, force: true }); }
}

test("CLI exposes update help and check-only without accepting unattended installation", async () => {
  const help = await cli(["--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("update");
  const details = await cli(["update", "--help"]);
  expect(details.stdout).toContain("--check");
  const unattended = await cli(["update"]);
  expect(unattended.code).toBe(1);
  expect(unattended.stderr).toContain("require a terminal");
  const unsupported = await cli(["update", "--yes"]);
  expect(unsupported.code).toBe(1);
  expect(unsupported.stderr).toContain("unknown option");
  const check = await cli(["update", "--check"]);
  expect(check.code).toBe(0);
  expect(check.stdout).toContain("source checkout");
});


test("bare CLI is a successful entry point; explicit help and invalid commands retain their contracts", async () => {
  const bare = await cli([]);
  expect(bare.code).toBe(0);
  expect(bare.stdout).toContain("Usage: temper");
  expect(bare.stderr).toBe("");
  const invalid = await cli(["not-a-command"]);
  expect(invalid.code).toBe(1);
  expect(invalid.stderr).toContain("unknown command");
});
