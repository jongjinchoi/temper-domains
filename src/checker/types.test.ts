import { test, expect, describe } from "bun:test";
import { DEFAULT_TLDS, EXTENDED_TLDS, TLD_PRESETS } from "./types.ts";

describe("DEFAULT_TLDS", () => {
  test("has 30 entries", () => {
    expect(DEFAULT_TLDS.length).toBe(30);
  });

  test("includes common TLDs", () => {
    expect(DEFAULT_TLDS).toContain("com");
    expect(DEFAULT_TLDS).toContain("net");
    expect(DEFAULT_TLDS).toContain("org");
    expect(DEFAULT_TLDS).toContain("io");
    expect(DEFAULT_TLDS).toContain("dev");
  });

  test("has no duplicates", () => {
    const unique = new Set(DEFAULT_TLDS);
    expect(unique.size).toBe(DEFAULT_TLDS.length);
  });
});

describe("EXTENDED_TLDS", () => {
  test("has more entries than DEFAULT_TLDS", () => {
    expect(EXTENDED_TLDS.length).toBeGreaterThan(DEFAULT_TLDS.length);
  });

  test("includes all DEFAULT_TLDS", () => {
    for (const tld of DEFAULT_TLDS) {
      expect(EXTENDED_TLDS).toContain(tld);
    }
  });

  test("has no duplicates", () => {
    const unique = new Set(EXTENDED_TLDS);
    expect(unique.size).toBe(EXTENDED_TLDS.length);
  });
});

describe("TLD_PRESETS", () => {
  test("has 4 presets", () => {
    expect(Object.keys(TLD_PRESETS)).toHaveLength(4);
  });

  test("has popular, tech, startup, cheap", () => {
    expect(TLD_PRESETS).toHaveProperty("popular");
    expect(TLD_PRESETS).toHaveProperty("tech");
    expect(TLD_PRESETS).toHaveProperty("startup");
    expect(TLD_PRESETS).toHaveProperty("cheap");
  });

  test("popular includes com", () => {
    expect(TLD_PRESETS["popular"]).toContain("com");
  });

  test("each preset has at least 5 TLDs", () => {
    for (const [, tlds] of Object.entries(TLD_PRESETS)) {
      expect(tlds.length).toBeGreaterThanOrEqual(5);
    }
  });
});
