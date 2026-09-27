import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performUpdate, updateCommands } from "./runner.ts";
import type { Installation } from "./installation.ts";
import type { Invocation } from "./process.ts";
import type { InstallerContext } from "./presentation.ts";

const paths: string[] = [];
afterEach(async () => { await Promise.all(paths.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function setup(kind: "npm" | "homebrew") {
  const directory = await mkdtemp(join(tmpdir(), "temper-update-runner-")); paths.push(directory);
  const home = await realpath(directory);
  const root = join(home, "temper"); const rack = join(home, "Cellar", "temper"); const keg = join(rack, "0.4.1");
  const entry = kind === "npm" ? join(root, "dist", "npm", "index.js") : join(keg, "bin", "temper");
  await mkdir(join(entry, ".."), { recursive: true }); await writeFile(entry, "");
  const installation: Installation = kind === "npm" ? { kind, channel: "npm", identity: home, entry, guidance: "", root, prefix: home, node: process.execPath, npm: { file: process.execPath, args: [join(home, "npm-cli.js")] } } :
    { kind, channel: "homebrew", identity: home, entry, guidance: "", rack, brew: "/fake/brew" };
  return { home, installation, keg };
}

test.each(["query", "stage"])("npm cancellation during %s cannot start installation", async boundary => {
  const { home, installation } = await setup("npm");
  const controller = new AbortController(); let executions = 0;
  const options = { lockDirectory: home, signal: controller.signal,
    query: async () => { if (boundary === "query") controller.abort(); return { stdout: "0.4.1", stderr: "" }; },
    onStage: async () => { if (boundary === "stage") controller.abort(); },
    execute: async () => { executions++; }, confirmTarget: async () => true,
  };
  const result = await performUpdate(installation, "0.5.0", options);
  expect(result).toEqual({ status: "cancelled" }); expect(executions).toBe(0);
  expect((await readdir(home)).filter(name => name.endsWith(".lock"))).toEqual([]);
});

test("preflight forwards user cancellation to a pending child query and drains the lock", async () => {
  const { home, installation } = await setup("npm");
  const controller = new AbortController(); let executions = 0;
  const options = { lockDirectory: home, signal: controller.signal,
    query: async (_command: Invocation, options?: import("./process.ts").ProcessOptions) => {
      const signal = options!.signal!;
      return new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("User signal did not reach query")), 200);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
        controller.abort();
      });
    },
    execute: async () => { executions++; }, confirmTarget: async () => true,
  };
  expect(await performUpdate(installation, "0.5.0", options)).toEqual({ status: "cancelled" });
  expect(executions).toBe(0);
  expect((await readdir(home)).filter(name => name.endsWith(".lock"))).toEqual([]);
});

test.each(["metadata", "confirmation", "stage"])("Homebrew cancellation at %s never upgrades after refresh", async boundary => {
  const { home, installation, keg } = await setup("homebrew");
  const controller = new AbortController(); const executed: string[] = []; let refreshed = false;
  const options = { lockDirectory: home, signal: controller.signal,
    query: async (command: Invocation) => {
      if (command.args.includes("info")) {
        if (refreshed && boundary === "metadata") controller.abort();
        return { stdout: JSON.stringify({ formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: false, versions: { stable: refreshed ? "0.6.0" : "0.5.0" }, installed: [{ version: "0.4.1" }] }] }), stderr: "" };
      }
      return { stdout: command.args.includes("--prefix") ? keg : "0.4.1", stderr: "" };
    },
    execute: async (command: Invocation) => { executed.push(command.args[0]!); refreshed = true; },
    confirmTarget: async () => { if (boundary === "confirmation") controller.abort(); return true; },
    onStage: async (stage: string) => { if (boundary === "stage" && stage === "installing") controller.abort(); },
  };
  expect(await performUpdate(installation, "0.5.0", options)).toEqual({ status: "cancelled" });
  expect(executed).toEqual(["update"]);
});

test.each(["0.5.0", "0.4.1"])("cancellation after installation still verifies the actual version %s", async installed => {
  const { home, installation } = await setup("npm"); const controller = new AbortController(); let changed = false; let reads = 0;
  const options = { lockDirectory: home, signal: controller.signal,
    query: async (_command: Invocation, options?: import("./process.ts").ProcessOptions) => {
      reads++; expect(options!.signal!.aborted).toBe(false);
      return { stdout: changed ? installed : "0.4.1", stderr: "" };
    },
    execute: async () => { changed = true; controller.abort(); }, confirmTarget: async () => true,
  };
  const result = performUpdate(installation, "0.5.0", options);
  if (installed === "0.5.0") expect(await result).toEqual({ status: "updated", version: installed });
  else await expect(result).rejects.toThrow("verification failed");
  expect(reads).toBe(2);
});

test("preflight timeout and an interrupted installer remain failures", async () => {
  const { home, installation } = await setup("npm"); const controller = new AbortController();
  const options = { lockDirectory: home, signal: controller.signal,
    query: async () => { throw new DOMException("timed out", "TimeoutError"); },
    execute: async () => {}, confirmTarget: async () => true,
  };
  await expect(performUpdate(installation, "0.5.0", options)).rejects.toThrow("timed out");
  await expect(performUpdate(installation, "0.5.0", { ...options,
    query: async () => ({ stdout: "0.4.1", stderr: "" }),
    execute: async () => { controller.abort(); throw new Error("installer interrupted; may have changed files"); },
  })).rejects.toThrow("installer interrupted");
});

test("npm installs the approved version and verifies the owned entry with a fresh process", async () => {
  const { home, installation } = await setup("npm");
  const executions: Invocation[] = []; let installed = "0.4.1";
  const stages: string[] = [];
  const result = await performUpdate(installation, "0.5.0", { lockDirectory: home,
    query: async () => { if (installed === "0.5.0") expect(stages.at(-1)).toBe("verifying"); return { stdout: installed, stderr: "" }; },
    onStage: async stage => { stages.push(stage); },
    execute: async command => { executions.push(command); installed = "0.5.0"; },
    confirmTarget: async () => true,
  });
  expect(result).toEqual({ status: "updated", version: "0.5.0" });
  expect(stages).toEqual(["installing", "verifying"]);
  expect(executions).toHaveLength(1);
  expect(executions[0]!.args).toContain("temper-domains@0.5.0");
  expect(executions[0]!.args).toContain("--prefix");
  expect(executions[0]!.args).toContain("--loglevel=warn");
  expect(executions[0]!.args).toContain("--no-progress");
  await expect(performUpdate(installation, "0.6.0", { lockDirectory: home, query: async () => ({ stdout: installed, stderr: "" }), execute: async () => {}, confirmTarget: async () => true })).rejects.toThrow("verification");
  expect(() => updateCommands(installation, "1.0.0;bad")).toThrow();
});

test("Homebrew refreshes metadata, requires changed-target approval and respects pins", async () => {
  const { home, installation, keg } = await setup("homebrew");
  let pinned = false; let refreshed = false; const executed: string[] = [];
  const query = async (command: Invocation) => ({ stdout: command.args.includes("info") ? JSON.stringify({ formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned, versions: { stable: refreshed ? "0.6.0" : "0.5.0" }, installed: [{ version: "0.4.1" }] }] }) : command.args.includes("--prefix") ? keg : "0.4.1", stderr: "" });
  const options = { lockDirectory: home, query, execute: async (command: Invocation) => { executed.push(command.args[0]!); refreshed = true; }, confirmTarget: async (version: string) => { expect(version).toBe("0.6.0"); return false; } };
  expect(await performUpdate(installation, "0.5.0", options)).toEqual({ status: "cancelled" });
  expect(executed).toEqual(["update"]);
  for (const command of updateCommands(installation, "0.5.0")) {
    expect(command.args).toContain("--quiet");
    expect(command.args).not.toContain("--yes");
    expect(command.args).not.toContain("--no-ask");
  }
  pinned = true;
  await expect(performUpdate(installation, "0.5.0", options)).rejects.toThrow("pinned");
  expect(executed).toEqual(["update"]);
});

test("failed metadata refresh never starts a Homebrew upgrade", async () => {
  const { home, installation, keg } = await setup("homebrew"); const calls: string[] = [];
  await expect(performUpdate(installation, "0.5.0", { lockDirectory: home,
    query: async command => ({ stdout: command.args.includes("info") ? JSON.stringify({ formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: false, versions: { stable: "0.5.0" }, installed: [{ version: "0.4.1" }] }] }) : command.args.includes("--prefix") ? keg : "0.4.1", stderr: "" }),
    execute: async command => { calls.push(command.args[0]!); throw new Error("refresh failed"); }, confirmTarget: async () => true,
  })).rejects.toThrow("refresh failed");
  expect(calls).toEqual(["update"]);
});

test("approved changed Homebrew target reaches the installer context and fresh verification", async () => {
  const { home, installation, keg } = await setup("homebrew");
  const contexts: InstallerContext[] = []; let refreshed = false; let installed = "0.4.1";
  const outcome = await performUpdate(installation, "0.5.0", { lockDirectory: home,
    query: async command => ({ stdout: command.args.includes("info") ? JSON.stringify({ formulae: [{ name: "temper", full_name: "jongjinchoi/temper-domains/temper", tap: "jongjinchoi/temper-domains", pinned: false, versions: { stable: refreshed ? "0.6.0" : "0.5.0" }, installed: [{ version: installed }] }] }) : command.args.includes("--prefix") ? keg : installed, stderr: "" }),
    execute: async (_command, context) => { contexts.push(context); if (context.stage === "refreshing") refreshed = true; else installed = "0.6.0"; },
    confirmTarget: async target => { expect(target).toBe("0.6.0"); return true; },
  });
  expect(contexts).toEqual([
    { channel: "homebrew", stage: "refreshing", current: "0.4.1", target: "0.5.0" },
    { channel: "homebrew", stage: "installing", current: "0.4.1", target: "0.6.0" },
  ]);
  expect(outcome).toEqual({ status: "updated", version: "0.6.0" });
});
