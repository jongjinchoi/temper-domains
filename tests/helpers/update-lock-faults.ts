import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, relative, sep } from "node:path";

// Test-only I/O faults, restricted to locks under a caller-owned temporary directory.
export async function injectUpdateLockFaults(directory: string) {
  assert.equal(await fs.realpath(directory), directory);
  const original = { ...fs };
  const faults = { close: false, unlink: false, write: false, closes: 0, unlinks: 0, path: "" };
  const errors = {
    close: Object.assign(new Error("injected close failure"), { code: "EIO" }),
    unlink: Object.assign(new Error("injected unlink failure"), { code: "EACCES" }),
    write: Object.assign(new Error("injected PID write failure"), { code: "EIO" }),
  };
  const owned = (path: unknown) => {
    const rel = relative(directory, String(path));
    return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && rel.endsWith(".lock");
  };
  const changed = { ...original,
    open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await original.open(...args);
      if (!owned(args[0])) return handle;
      faults.path = String(args[0]);
      const close = handle.close.bind(handle), write = handle.writeFile.bind(handle);
      handle.close = async () => {
        faults.closes++;
        // The descriptor really closes before the injected rejection. This does
        // not simulate the OS descriptor state after a failed close syscall.
        await close();
        if (faults.close) throw errors.close;
      };
      handle.writeFile = async (...values: Parameters<typeof handle.writeFile>) => {
        if (faults.write) throw errors.write;
        return write(...values);
      };
      return handle;
    },
    unlink: async (...args: Parameters<typeof fs.unlink>) => {
      if (owned(args[0])) { faults.unlinks++; if (faults.unlink) throw errors.unlink; }
      return original.unlink(...args);
    },
  };
  const replace = async (methods: typeof original) => {
    Object.assign(fs, methods);
    syncBuiltinESMExports();
    if (process.versions.bun) {
      const { mock } = await import("bun:test");
      mock.module("node:fs/promises", () => methods);
    }
  };
  await replace(changed);
  return { faults, errors, original, restore: () => replace(original) };
}
