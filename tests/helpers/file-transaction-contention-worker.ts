import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

// Refuses the lock creation or the replacing rename with EPERM a given number of
// times ("always" for every attempt), as Windows does under contention.
const [path, platform, step, times] = process.argv.slice(2) as [string, NodeJS.Platform, "lock" | "rename", string];
Object.defineProperty(process, "platform", { value: platform });
const original = { ...fs };
let injected = 0;
const refuse = (operation: string, target: string) => {
  if (times !== "always" && injected >= Number(times)) return;
  injected++;
  throw Object.assign(new Error(`EPERM: operation not permitted, ${operation} '${target}'`), { code: "EPERM", syscall: operation });
};
const changed = {
  ...original,
  open: async (...args: Parameters<typeof fs.open>) => {
    if (step === "lock" && String(args[0]).endsWith(".lock")) refuse("open", String(args[0]));
    return original.open(...args);
  },
  rename: async (...args: Parameters<typeof fs.rename>) => {
    if (step === "rename") refuse("rename", String(args[0]));
    return original.rename(...args);
  },
};
Object.assign(fs, changed);
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import("bun:test");
  mock.module("node:fs/promises", () => changed);
}
const { withFileTransaction } = await import("../../src/utils/file-transaction.ts");
const { formatStorageError } = await import("../../src/utils/storage-error.ts");
const started = Date.now();
try {
  await withFileTransaction(path, { subject: "Test data", deadline: started + 300, busyMessage: "busy" }, async tx => { await tx.replace("new"); });
  console.log(JSON.stringify({ committed: true, injected, elapsed: Date.now() - started }));
} catch (error) {
  console.log(JSON.stringify({ committed: false, injected, elapsed: Date.now() - started,
    code: (error as NodeJS.ErrnoException).code, text: formatStorageError(error) }));
}
