import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { injectUpdateLockFaults } from "../helpers/update-lock-faults.ts";

export async function checkLockCleanup(only?: string) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "temper-update-cleanup-")));
  const { faults, errors, original, restore } = await injectUpdateLockFaults(home);
  const { withInstallLock } = await import("../../src/update/process.ts");
  const prior = new Error("prior cause");
  const primary = new Error("installer failed", { cause: prior });
  try {
    for (const mode of ["close", "unlink", "both", "none"]) {
      if (only && mode !== only) continue;
      for (const work of ["success", "failure", "undefined", "write"]) {
        const dir = join(home, `${mode}-${work}`);
        faults.close = mode === "close" || mode === "both";
        faults.unlink = mode === "unlink" || mode === "both";
        faults.write = work === "write";
        faults.closes = faults.unlinks = 0;
        let calls = 0;
        const value = { version: "0.5.0" };
        const settled = await withInstallLock(dir, "owned", async () => {
          calls++;
          if (work === "failure") throw primary;
          if (work === "undefined") throw undefined;
          return value;
        }).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
        assert.equal(calls, work === "write" ? 0 : 1);
        assert.equal(faults.closes, 1);
        assert.equal(faults.unlinks, 1, "close rejection must not skip unlink");
        const locks = (await original.readdir(dir)).filter(name => name.endsWith(".lock"));
        assert.equal(locks.length, faults.unlink ? 1 : 0);
        const expectedErrors = [...(faults.close ? [errors.close] : []), ...(faults.unlink ? [errors.unlink] : [])];
        if (work === "success") {
          assert.equal(settled.ok, true, "cleanup must not replace a successful work result");
          assert.equal(settled.value.value, value);
          if (mode === "none") assert.equal(settled.value.cleanup, undefined);
          else {
            assert.equal(settled.value.cleanup?.path.startsWith(dir), true);
            assert.deepEqual(settled.value.cleanup?.failures.map(item => item.operation), mode === "both" ? ["close", "unlink"] : [mode]);
            assert.deepEqual(settled.value.cleanup?.failures.map(item => item.error), expectedErrors);
          }
        } else {
          assert.equal(settled.ok, false);
          const reason = work === "write" ? errors.write : work === "undefined" ? undefined : primary;
          if (mode === "none") assert.equal(settled.error, reason);
          else {
            assert.ok(settled.error instanceof AggregateError);
            assert.equal(settled.error.cause, reason);
            assert.deepEqual(settled.error.errors, [reason, ...expectedErrors]);
            assert.ok(settled.error.message.startsWith(reason instanceof Error ? reason.message : String(reason)));
            assert.match(settled.error.message, /lock cleanup/i);
            if (faults.unlink) assert.ok(settled.error.message.includes(join(dir, locks[0]!)));
            else assert.doesNotMatch(settled.error.message, /remove this file/i);
          }
        }
        assert.equal(primary.cause, prior);
        faults.close = faults.unlink = faults.write = false;
        // A fresh process sees the OS lock state, independently of the fault
        // injection in this process. Its acquisition must agree with that state.
        const nextProcess = (path: string) => spawnSync(process.execPath, ["-e",
          "const fs=require('node:fs');try{const fd=fs.openSync(process.argv[1],'wx',0o600);fs.closeSync(fd);fs.unlinkSync(process.argv[1]);}catch(e){if(e.code==='EEXIST')process.exit(2);throw e;}", path], { encoding: "utf8" });
        const path = faults.path;
        assert.equal(path.startsWith(dir), true);
        if (locks.length) {
          assert.equal(nextProcess(path).status, 2);
          const before = await original.readFile(path, "utf8");
          await assert.rejects(withInstallLock(dir, "owned", async () => { throw new Error("Must not run"); }), /already running/);
          assert.equal(await original.readFile(path, "utf8"), before);
          await original.unlink(path); // Remove only this test's retained lock.
        }
        assert.equal(nextProcess(path).status, 0);
        assert.deepEqual(await withInstallLock(dir, "owned", async () => 42), { value: 42 });
      }
    }
    console.log(`Updater lock cleanup contracts passed (${only ?? "all combinations"}).`);
  } finally { await restore(); await rm(home, { recursive: true, force: true }); }
}
