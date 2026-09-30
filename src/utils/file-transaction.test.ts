import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Bun and Node preserve data before replacement and clean up after close failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-transaction-"));
  try {
    const source = resolve("tests/helpers/file-transaction-worker.ts");
    const built = await Bun.build({ entrypoints: [source], outdir: join(dir, "build"), target: "node", packages: "external" });
    expect(built.success).toBe(true);
    for (const [runtime, worker] of [[process.execPath, source], ["node", join(dir, "build/file-transaction-worker.js")]]) {
      for (const failure of ["lock-write", "writeFile", "sync", "close", "rename", "lock-close", "unlink", "none"]) {
        const path = join(dir, "data");
        await writeFile(path, "old");
        const child = Bun.spawn([runtime!, worker!, path, failure], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        const result = JSON.parse(stdout);
        expect(result.injected).toBe(failure === "none" ? 0 : 1);
        const committed = ["none", "lock-close", "unlink"].includes(failure);
        expect(result.committed).toBe(committed);
        if (failure === "lock-write") expect(result).toMatchObject({ kind: "FileTransactionError", callbackRan: false });
        // The helper states the outcome once; only a remaining lock needs guidance.
        if (failure !== "none") expect(result.text).toBe(committed
          ? `Test data was saved, but cleanup failed: injected ${failure}${failure === "unlink"
            ? `. After confirming no temper command is running, remove only ${path}.lock before the next attempt.` : ""}`
          : `Test data was not saved: injected ${failure}`);
        expect(await readFile(path, "utf8")).toBe(committed ? "new" : "old");
        expect((await readdir(dir)).filter(name => name !== "build").sort()).toEqual(failure === "unlink" ? ["data", "data.lock"] : ["data"]);
        if (failure === "unlink") await rm(path + ".lock");
      }
      for (const operation of ["caller-error", "caller-cause", "caller-undefined"]) for (const failure of ["none", "lock-close", "unlink"]) {
        const path = join(dir, "data");
        await writeFile(path, "old");
        const child = Bun.spawn([runtime!, worker!, path, failure, operation], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        // Caller rejections keep their identity and text; cleanup errors ride along as cause.
        const result = JSON.parse(stdout);
        expect(result.injected).toBe(failure === "none" ? 0 : 1);
        if (operation === "caller-undefined") expect(result).toMatchObject({ rejected: true, kind: "undefined" });
        else {
          expect(result).toMatchObject({ same: true, kind: "RangeError", text: "caller rejected" });
          expect(result.cleanup).toEqual(failure === "none" ? undefined : [`Error: injected ${failure}`]);
          if (failure !== "none") expect(result.display).toContain(`injected ${failure}`);
          expect(result.display.includes("remove only")).toBe(failure === "unlink");
          if (operation === "caller-cause") expect(result.priorPreserved).toBe(true);
          expect(result.display).not.toContain("original private cause");
        }
        expect(await readFile(path, "utf8")).toBe("old");
        expect((await readdir(dir)).filter(name => name !== "build").sort()).toEqual(failure === "unlink" ? ["data", "data.lock"] : ["data"]);
        if (failure === "unlink") await rm(path + ".lock");
      }
      for (const operation of ["policy", "cancel", "abort-commit", "abort-cleanup"]) {
        const path = join(dir, "data");
        const original = '{"version":2,"servers":{}}';
        await writeFile(path, original);
        const child = Bun.spawn([runtime!, worker!, path, operation === "abort-commit" ? "none" : "lock-close", operation], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        if (operation === "abort-commit") expect(JSON.parse(stdout)).toEqual({ aborted: true, before: 1, after: 0, injected: 1 });
        else if (operation === "abort-cleanup") {
          const result = JSON.parse(stdout);
          expect(result).toMatchObject({ kind: "Error", sameCancellation: true, priorPreserved: true, injected: 1, diagnosticCommitted: true });
          expect(result.display).toContain("custom cancellation");
          expect(result.display).toContain("injected lock-close");
        }
        else {
          expect(JSON.parse(stdout)).toMatchObject({ kind: operation === "policy" ? "ServerCooldown" : "DOMException", injected: 1, cleanup: ["Error: injected lock-close"] });
          expect(await readFile(path, "utf8")).toBe(original);
        }
        expect((await readdir(dir)).filter(name => name !== "build")).toEqual(["data"]);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);

// Windows reports a lock another process is creating or removing, and a target
// another process has open, as EPERM. Measured on a Windows runner; retries clear it.
test("Bun and Node wait out Windows EPERM contention within the deadline and keep it elsewhere", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-contention-"));
  try {
    const source = resolve("tests/helpers/file-transaction-contention-worker.ts");
    const built = await Bun.build({ entrypoints: [source], outdir: join(dir, "build"), target: "node", packages: "external" });
    expect(built.success).toBe(true);
    for (const [runtime, worker] of [[process.execPath, source], ["node", join(dir, "build/file-transaction-contention-worker.js")]]) {
      const run = async (platform: string, step: string, times: string) => {
        const path = join(dir, "data");
        await writeFile(path, "old");
        const child = Bun.spawn([runtime!, worker!, path, platform, step, times], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        const result = { ...JSON.parse(stdout), data: await readFile(path, "utf8"), files: (await readdir(dir)).filter(name => name !== "build").sort() };
        return result;
      };
      // A momentary refusal is waited out and the data is saved.
      for (const step of ["lock", "rename"]) {
        expect(await run("win32", step, "3")).toMatchObject({ committed: true, injected: 3, data: "new", files: ["data"] });
      }
      // A refusal that lasts past the deadline keeps its own error, not the busy message.
      const lock = await run("win32", "lock", "always");
      expect(lock).toMatchObject({ committed: false, code: "EPERM", data: "old", files: ["data"] });
      expect(lock.text).toContain("EPERM: operation not permitted, open");
      expect(lock.elapsed).toBeGreaterThanOrEqual(250);
      const rename = await run("win32", "rename", "always");
      expect(rename).toMatchObject({ committed: false, data: "old", files: ["data"] });
      expect(rename.text).toStartWith("Test data was not saved: EPERM: operation not permitted, rename");
      expect(rename.elapsed).toBeGreaterThanOrEqual(250);
      // Other platforms keep failing at once.
      const posix = await run("linux", "lock", "1");
      expect(posix).toMatchObject({ committed: false, code: "EPERM", injected: 1, data: "old", files: ["data"] });
      expect(posix.elapsed).toBeLessThan(250);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 20000);
