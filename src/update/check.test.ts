import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate, postponeUpdate } from "./check.ts";
import type { Installation } from "./installation.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
test("cached checks avoid networking; later suppresses only automatic prompts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-check-")); dirs.push(dir);
  const installation: Installation = { kind: "manual", channel: "npm", entry: "/test/temper.js", identity: "local", guidance: "Update local project" };
  let requests = 0; let now = 1_000_000;
  const deps = { cacheFile: join(dir, "cache.json"), entry: "/test/temper.js", current: "0.4.1", now: () => now,
    detect: async () => installation, latest: async () => { requests++; return "0.5.0"; } };
  const result = await checkForUpdate(true, deps);
  expect(result?.latest).toBe("0.5.0");
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  expect(requests).toBe(1);
  await postponeUpdate(result!);
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect((await checkForUpdate(false, deps))?.latest).toBe("0.5.0");
  expect(requests).toBe(2);
  now += 86_400_001;
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
});

test("automatic discovery timeout aborts work and backoff avoids repeated work", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-timeout-")); dirs.push(dir);
  let aborted = false; let detections = 0;
  const deps = { cacheFile: join(dir, "cache.json"), entry: "/test/temper", current: "0.4.1", automaticTimeout: 25,
    detect: async (signal: AbortSignal): Promise<Installation> => { detections++; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("timeout")); })); } };
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect(aborted).toBe(true);
  expect(await checkForUpdate(true, deps)).toBeNull();
  expect(detections).toBe(1);
  await expect(checkForUpdate(false, { ...deps, manualTimeout: 25 })).rejects.toThrow();
});

test("cached metadata is not reused after the detected installation channel changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-channel-")); dirs.push(dir);
  let channel: "npm" | "homebrew" = "npm";
  const requests: string[] = [];
  const deps = { cacheFile: join(dir, "cache.json"), entry: "/test/temper", current: "0.4.1",
    detect: async (): Promise<Installation> => ({ kind: "manual", entry: "/test/temper", identity: channel, channel, guidance: "manual" }),
    latest: async (value: "npm" | "homebrew") => { requests.push(value); return value === "npm" ? "0.6.0" : "0.5.0"; } };
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.6.0");
  channel = "homebrew";
  expect((await checkForUpdate(true, deps))?.latest).toBe("0.5.0");
  expect(requests).toEqual(["npm", "homebrew"]);
});
