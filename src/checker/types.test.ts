import { test, expect, describe } from "bun:test";
import { DEFAULT_TLDS, EXTENDED_TLDS } from "./types.ts";

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
  test("has 60 entries including design", () => {
    expect(EXTENDED_TLDS.length).toBe(60);
    expect(EXTENDED_TLDS).toContain("design");
    expect(DEFAULT_TLDS).not.toContain("design");
  });

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
