import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate } from "./check.ts";
import type { Installation } from "./installation.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
test("each invocation fetches the published version; Later does not suppress the next check", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-check-")); dirs.push(dir);
  const installation: Installation = { kind: "manual", channel: "npm", entry: "/test/temper.js", identity: "local", guidance: "Update local project" };
  let requests = 0;
  const deps = { lockDirectory: dir, entry: "/test/temper.js", current: "0.4.1",
    detect: async () => installation, latest: async () => { requests++; return "0.5.0"; } };
  const result = await checkForUpdate(true, deps);
  expect(result?.latest).toBe("0.5.0");
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  expect(requests).toBe(2);
  await writeFile(join(dir, "update.json"), JSON.stringify({ schema: 1, latest: "0.4.1", postponedAt: Date.now(), failed: true, attemptedAt: Date.now() }));
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  expect((await checkForUpdate(false, deps))?.latest).toBe("0.5.0");
  expect(requests).toBe(4);
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
});

test("automatic discovery timeout aborts work and does not block the next invocation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-timeout-")); dirs.push(dir);
  let aborted = false; let detections = 0;
  const deps = { lockDirectory: dir, entry: "/test/temper", current: "0.4.1", automaticTimeout: 25,
    detect: async (signal: AbortSignal): Promise<Installation> => { detections++; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("timeout")); })); } };
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect(aborted).toBe(true);
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect(detections).toBe(2);
  await expect(checkForUpdate(false, { ...deps, manualTimeout: 25 })).rejects.toThrow();
});

test("each check follows the current installation channel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-channel-")); dirs.push(dir);
  let channel: "npm" | "homebrew" = "npm";
  const requests: string[] = [];
  const deps = { lockDirectory: dir, entry: "/test/temper", current: "0.4.1",
    detect: async (): Promise<Installation> => ({ kind: "manual", entry: "/test/temper", identity: channel, channel, guidance: "manual" }),
    latest: async (value: "npm" | "homebrew") => { requests.push(value); return value === "npm" ? "0.6.0" : "0.5.0"; } };
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.6.0");
  channel = "homebrew";
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  expect(requests).toEqual(["npm", "homebrew"]);
});

test("automatic failure is reported and the next invocation can discover an update", async () => {
  const failures: unknown[] = [];
  let fail = true;
  let latest = "0.5.0";
  const deps = { entry: "/test/temper", current: "0.5.0", onFailure: (error: unknown) => failures.push(error),
    detect: async (): Promise<Installation> => ({ kind: "manual", entry: "/test/temper", identity: "test", channel: "npm", guidance: "manual" }),
    latest: async () => { if (fail) throw new Error("offline"); return latest; } };
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect(failures).toHaveLength(1);
  fail = false;
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  latest = "0.5.1";
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.1");
  deps.current = "0.5.1";
  expect((await checkForUpdate(true, deps))?.current).toBe("0.5.1");
  latest = "0.5.2";
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.2");
});
