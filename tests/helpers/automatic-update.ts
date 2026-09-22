import "./home.ts";
// Isolated CLI scenarios: no registry requests or real installer can run.
import { mock } from "bun:test";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const home = process.env.TEMPER_TEST_HOME!;
const state = JSON.parse(readFileSync(join(home, "scenario.json"), "utf8"));
mock.module("../../src/version.ts", () => ({ VERSION: state.current }));
mock.module("../../src/update/check.ts", () => ({
  checkForUpdate: async (_automatic: boolean, options: { onFailure?: (error: unknown) => void }) => {
    appendFileSync(join(home, "checks.log"), "check\n");
    if (state.fail) { options.onFailure?.(new Error("synthetic offline")); return null; }
    return { current: state.current, latest: state.latest, lockDirectory: home,
      installation: { kind: "npm", channel: "npm", identity: "fake", entry: join(home, "missing-entry"), guidance: "", npm: { file: join(home, "missing-installer"), args: [] }, node: process.execPath, prefix: home, root: home },
    };
  },
}));
