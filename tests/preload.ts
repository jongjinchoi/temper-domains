import { afterAll, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";

// Existing checker tests can populate the bootstrap cache. Keep all test writes
// away from the developer's real ~/.temper directory.
const home = mkdtempSync(join(os.tmpdir(), "temper-suite-"));
mock.module("node:os", () => ({ ...os, homedir: () => home }));
afterAll(() => rmSync(home, { recursive: true, force: true }));
