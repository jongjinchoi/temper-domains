import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TLDS, EXTENDED_TLDS } from "../../../src/checker/types.ts";
import { THEME_NAMES } from "../../../src/tui/theme.ts";
import {
  COMMANDS,
  DEFAULT_TLDS_COUNT,
  EXTENDED_TLDS_COUNT,
  MCP_TOOLS,
  THEMES,
} from "../temper-data.ts";

describe("temper-data sync", () => {
  test("DEFAULT_TLDS_COUNT matches src/checker/types.ts", () => {
    expect(DEFAULT_TLDS_COUNT).toBe(DEFAULT_TLDS.length);
  });

  test("EXTENDED_TLDS_COUNT matches src/checker/types.ts", () => {
    expect(EXTENDED_TLDS_COUNT).toBe(EXTENDED_TLDS.length);
  });

  test("THEMES keys match src/tui/theme.ts THEME_NAMES (order included)", () => {
    expect(THEMES.map((t) => t.key)).toEqual(THEME_NAMES);
  });

  test("MCP_TOOLS matches registerTool calls in src/mcp/server.ts", () => {
    const serverSource = readFileSync(
      join(import.meta.dir, "../../../src/mcp/server.ts"),
      "utf-8",
    );
    const registered = [
      ...serverSource.matchAll(/server\.registerTool\("([^"]+)"/g),
    ].map((m) => m[1]);
    // Order doesn't have to match; set equality is enough.
    expect(new Set(MCP_TOOLS)).toEqual(new Set(registered));
  });

  test("COMMANDS reference real CLI verbs defined in src/index.ts", () => {
    const cliSource = readFileSync(
      join(import.meta.dir, "../../../src/index.ts"),
      "utf-8",
    );
    for (const cmd of COMMANDS) {
      const pattern = new RegExp(`\\.command\\("${cmd.sig.cmd}"\\)`);
      expect(cliSource).toMatch(pattern);
    }
  });
});
