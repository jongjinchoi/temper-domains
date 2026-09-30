import { expect, test } from "bun:test";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SIGNALS = [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const;

async function until(stream: ReadableStream<Uint8Array>, marker: string): Promise<void> {
  const reader = stream.getReader();
  let text = "";
  try {
    while (!text.includes(marker)) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`Worker ended before ${marker}: ${text}`);
      text += new TextDecoder().decode(value);
    }
  } finally { reader.releaseLock(); }
}
const exists = (path: string) => access(path).then(() => true, () => false);

test.skipIf(process.platform === "win32")("signals wait for a held file transaction, then exit with 128+signal and leave no lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-shutdown-"));
  try {
    const source = resolve("tests/helpers/shutdown-worker.ts");
    const built = await Bun.build({ entrypoints: [source], outdir: join(dir, "build"), target: "node", packages: "external" });
    expect(built.success).toBe(true);
    for (const [runtime, worker] of [[process.execPath, source], ["node", join(dir, "build/shutdown-worker.js")]]) {
      for (const [signal, code] of SIGNALS) {
        const path = join(dir, "data");
        await writeFile(path, "old");
        const spawn = (mode: string) => Bun.spawn([runtime!, worker!, path, mode], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });

        // Held transaction: the signal must not end the process until the lock is released.
        const held = spawn("held");
        await until(held.stdout, "HOLDING");
        held.kill(signal);
        const early = await Promise.race([held.exited.then(() => "exited"), Bun.sleep(300).then(() => "alive")]);
        expect({ runtime, signal, early, lock: await exists(`${path}.lock`) }).toEqual({ runtime, signal, early: "alive", lock: true });
        held.stdin.write("go\n"); held.stdin.end();
        expect({ runtime, signal, code: await held.exited }).toEqual({ runtime, signal, code });
        expect(await readFile(path, "utf8")).toBe("new");
        expect((await readdir(dir)).filter(name => name !== "build")).toEqual(["data"]);

        // No transaction in progress: exit immediately.
        const idle = spawn("idle");
        await until(idle.stdout, "READY");
        idle.kill(signal);
        expect({ runtime, signal, code: await idle.exited }).toEqual({ runtime, signal, code });

        // A second signal ends a transaction that never finishes.
        const stuck = spawn("stuck");
        await until(stuck.stdout, "HOLDING");
        stuck.kill(signal);
        await Bun.sleep(100);
        stuck.kill(signal);
        expect({ runtime, signal, code: await stuck.exited }).toEqual({ runtime, signal, code });
        await rm(`${path}.lock`, { force: true });
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30000);
