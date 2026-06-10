import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TLDS, EXTENDED_TLDS } from "../../../src/checker/types.ts";
import { THEME_NAMES } from "../../../src/tui/theme.ts";
import {
  COMMANDS,
  DEFAULT_SEARCH_TIMEOUT_SECONDS,
  DEFAULT_TLDS_COUNT,
  EXTENDED_TLDS_COUNT,
  HERO_DEMO_TLDS,
  MCP_TOOLS,
  PLAYGROUND_TLDS,
  THEMES,
} from "../temper-data.ts";

describe("temper-data sync", () => {
  test("DEFAULT_TLDS_COUNT matches src/checker/types.ts", () => {
    expect(DEFAULT_TLDS_COUNT).toBe(DEFAULT_TLDS.length);
  });

  test("EXTENDED_TLDS_COUNT matches src/checker/types.ts", () => {
    expect(EXTENDED_TLDS_COUNT).toBe(EXTENDED_TLDS.length);
  });

  test("PLAYGROUND_TLDS is a subset of EXTENDED_TLDS", () => {
    const extended = new Set<string>(EXTENDED_TLDS);
    for (const tld of PLAYGROUND_TLDS) {
      expect(extended.has(tld)).toBe(true);
    }
  });

  test("HERO_DEMO_TLDS is a subset of EXTENDED_TLDS", () => {
    const extended = new Set<string>(EXTENDED_TLDS);
    for (const tld of HERO_DEMO_TLDS) {
      expect(extended.has(tld)).toBe(true);
    }
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

  test("DEFAULT_SEARCH_TIMEOUT_SECONDS matches the CLI search option default", () => {
    const cliSource = readFileSync(
      join(import.meta.dir, "../../../src/index.ts"),
      "utf-8",
    );

    expect(cliSource).toContain(`const DEFAULT_SEARCH_TIMEOUT_SECONDS = ${DEFAULT_SEARCH_TIMEOUT_SECONDS}`);
    expect(cliSource).toContain("String(DEFAULT_SEARCH_TIMEOUT_SECONDS)");
  });

  test("llms.txt is rendered by an app route with dynamic version data", () => {
    const staticLlmsPath = join(import.meta.dir, "../../public/llms.txt");
    const routeSource = readFileSync(
      join(import.meta.dir, "../../app/llms.txt/route.ts"),
      "utf-8",
    );

    expect(existsSync(staticLlmsPath)).toBe(false);
    expect(routeSource).toContain("getVersion()");
    expect(routeSource).not.toMatch(/Current version:\s+0\.\d+\.\d+/);
  });
});
