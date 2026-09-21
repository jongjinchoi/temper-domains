import "./home.ts";
import { mock } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";

const home = process.env.TEMPER_TEST_HOME!;
const fail = process.env.TEMPER_CONFIG_FAIL;
const pause = process.env.TEMPER_CONFIG_PAUSE;
const original = { ...fs };
if (fail || pause) {
  mock.module("node:fs/promises", () => ({
    ...original,
    open: async (...args: Parameters<typeof fs.open>) => {
      if (fail === "open" && String(args[0]).endsWith(".tmp")) throw new Error("test open failed");
      const file = await original.open(...args);
      let closeFailed = false;
      if (!String(args[0]).endsWith(".tmp")) return file;
      return new Proxy(file, {
        get(target, key) {
          if ((key === "writeFile" && fail?.startsWith("write")) || (key === "sync" && fail === "sync")) {
            return async () => { throw new Error(`test ${fail} failed`); };
          }
          if (key === "close" && fail === "close" && !closeFailed) {
            closeFailed = true;
            return async () => { throw new Error("test close failed"); };
          }
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (fail === "rename") throw new Error("test rename failed");
      if (pause === "before") {
        await original.writeFile(join(home, "paused"), "before");
        await new Promise(() => { setInterval(() => {}, 1000); });
      }
      await original.rename(...args);
      if (pause === "after") {
        await original.writeFile(join(home, "paused"), "after");
        await new Promise(() => { setInterval(() => {}, 1000); });
      }
    },
    unlink: async (...args: Parameters<typeof fs.unlink>) => {
      if (fail?.endsWith("cleanup") && String(args[0]).endsWith(".lock")) throw new Error("test lock cleanup failed");
      return original.unlink(...args);
    },
  }));
}

const { loadConfig, saveConfig } = await import("../../src/config/config.ts");
await original.writeFile(join(home, `ready-${process.pid}`), "ready");
try {
  if (process.argv[2] !== "load") await saveConfig(JSON.parse(process.argv[2]!));
  console.log(JSON.stringify(await loadConfig()));
} catch (error) {
  console.error(JSON.stringify({ message: String(error), committed: (error as { committed?: boolean }).committed }));
  process.exitCode = 1;
}
