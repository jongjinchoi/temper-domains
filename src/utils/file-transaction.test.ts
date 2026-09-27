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
      for (const failure of ["writeFile", "sync", "close", "rename", "lock-close", "unlink", "none"]) {
        const path = join(dir, "data");
        await writeFile(path, "old");
        const child = Bun.spawn([runtime!, worker!, path, failure], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        const result = JSON.parse(stdout);
        expect(result.injected).toBe(failure === "none" ? 0 : 1);
        const committed = ["none", "lock-close", "unlink"].includes(failure);
        expect(result.committed).toBe(committed);
        expect(await readFile(path, "utf8")).toBe(committed ? "new" : "old");
        expect((await readdir(dir)).filter(name => name !== "build").sort()).toEqual(failure === "unlink" ? ["data", "data.lock"] : ["data"]);
        if (failure === "unlink") await rm(path + ".lock");
      }
      for (const operation of ["policy", "cancel", "abort-commit"]) {
        const path = join(dir, "data");
        const original = '{"version":2,"servers":{}}';
        await writeFile(path, original);
        const child = Bun.spawn([runtime!, worker!, path, operation === "abort-commit" ? "none" : "lock-close", operation], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
        if (operation === "abort-commit") expect(JSON.parse(stdout)).toEqual({ aborted: true, before: 1, after: 0, injected: 1 });
        else {
          expect(JSON.parse(stdout)).toMatchObject({ kind: operation === "policy" ? "ServerCooldown" : "DOMException", injected: 1, cleanup: ["Error: injected lock-close"] });
          expect(await readFile(path, "utf8")).toBe(original);
        }
        expect((await readdir(dir)).filter(name => name !== "build")).toEqual(["data"]);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);
