import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("CLI forwards preflight cancellation through the real prompt and runner, then exits 130", async () => {
  const child = Bun.spawn([process.execPath, "tests/helpers/update-cli-cancel-worker.tsx"], { stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(code).toBe(130);
  expect(err.trim()).toBe("Update cancelled.");
  expect(JSON.parse(out)).toEqual({ stopped: true, executions: 0, raw: false, locks: [] });
});

for (const scenario of ["updated-close", "updated-unlink", "current-close", "cancel-unlink", "failed-both"]) {
  test(`CLI ${scenario} preserves the update outcome and reports lock recovery after terminal restoration`, async () => {
    const child = Bun.spawn([process.execPath, "tests/helpers/update-cli-cancel-worker.tsx", scenario], { stdout: "pipe", stderr: "pipe" });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code).toBe(1);
    const result = JSON.parse(out.split("RESULT:")[1]!);
    expect(result.stopped).toBe(true);
    expect(result.raw).toBe(false);
    expect(result.reportedRaw.length).toBeGreaterThan(0);
    expect(result.reportedRaw.every((raw: boolean) => !raw)).toBe(true);
    expect(result.executions).toBe(scenario.startsWith("current") || scenario.startsWith("cancel") ? 0 : 1);
    expect(err.match(/lock cleanup/gi)?.length).toBe(1);
    const retained = scenario.endsWith("unlink") || scenario.endsWith("both");
    expect(result.locks.length).toBe(retained ? 1 : 0);
    if (retained) {
      expect(err).toContain(join(result.home, result.locks[0]));
      expect(err).toContain("confirming no updater is running");
    } else expect(err).not.toContain("Remove this file");
    if (scenario.startsWith("failed")) {
      expect(err).toContain("installer checksum mismatch");
      expect(err.indexOf("installer checksum mismatch")).toBeLessThan(err.indexOf("lock cleanup"));
      expect(err).toContain("injected close failure");
      expect(err).toContain("injected unlink failure");
      expect(result.frame).not.toContain("Temper updated:");
    } else {
      expect(err).not.toContain("Update failed:");
      expect(err).not.toContain("retry with temper update");
      if (scenario.startsWith("updated")) expect(result.frame).toContain("Temper updated:");
      if (scenario.startsWith("current")) expect(result.frame).toContain("is already installed");
      if (scenario.startsWith("cancel")) expect(err).toContain("Update cancelled.");
    }
  });
}

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
