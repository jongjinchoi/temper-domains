import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const [path, failure] = process.argv.slice(2) as [string, string];
const original = { ...fs };
let injected = 0;
const fail = () => { injected++; throw new Error(`injected ${failure}`); };
const changed = {
  ...original,
  open: async (...args: Parameters<typeof fs.open>) => {
    const handle = await original.open(...args);
    const temporary = String(args[0]).endsWith(".tmp");
    for (const method of ["writeFile", "sync", "close"] as const) {
      const bound = handle[method].bind(handle) as (...args: any[]) => Promise<any>;
      (handle as any)[method] = async (...values: any[]) => {
        if (temporary && failure === method && injected === 0) {
          if (method === "close") await bound(...values);
          fail();
        }
        if (!temporary && method === "close" && failure === "lock-close") { await bound(...values); fail(); }
        return bound(...values);
      };
    }
    return handle;
  },
  rename: async (...args: Parameters<typeof fs.rename>) => {
    if (failure === "rename") fail();
    await original.rename(...args);
  },
  unlink: async (...args: Parameters<typeof fs.unlink>) => {
    if (failure === "unlink" && String(args[0]).endsWith(".lock")) fail();
    return original.unlink(...args);
  },
};
Object.assign(fs, changed);
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import("bun:test");
  mock.module("node:fs/promises", () => changed);
}
const { withFileTransaction } = await import("../../src/utils/file-transaction.ts");
try {
  if (process.argv[4] === "policy") {
    const { FileLimitStore } = await import("../../src/checker/limit-store.ts");
    const { ServerCooldown } = await import("../../src/checker/limits.ts");
    await new FileLimitStore(path).update(() => { throw new ServerCooldown(100000, "server", "rate_limited"); });
  } else {
  await withFileTransaction(path, { deadline: Date.now() + 1000, busyMessage: "busy" }, async tx => { await tx.replace("new"); });
  }
  console.log(JSON.stringify({ committed: true, injected }));
} catch (error) {
  console.log(JSON.stringify({ message: String(error), committed: (error as { committed?: boolean }).committed, injected,
    kind: (error as Error).constructor.name, cleanup: (error as Error).cause instanceof AggregateError ? (error as Error & { cause: AggregateError }).cause.errors.map(String) : undefined }));
}
