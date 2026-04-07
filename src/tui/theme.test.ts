import { test, expect, describe, beforeEach } from "bun:test";
import { setTheme, theme, getStatusStyle, THEME_NAMES } from "./theme.ts";

describe("THEME_NAMES", () => {
  test("has 5 themes", () => {
    expect(THEME_NAMES).toHaveLength(5);
  });

  test("includes temper-forge", () => {
    expect(THEME_NAMES).toContain("temper-forge");
  });

  test("includes seoul-night", () => {
    expect(THEME_NAMES).toContain("seoul-night");
  });
});

describe("setTheme", () => {
  beforeEach(() => {
    setTheme("temper-forge");
  });

  test("changes theme to dracula", () => {
    setTheme("dracula");
    expect(theme.primary).toBe("#bd93f9");
    expect(theme.base).toBe("#282a36");
  });

  test("changes theme to seoul-night", () => {
    setTheme("seoul-night");
    expect(theme.primary).toBe("#ff4d8d");
  });

  test("falls back to temper-forge for unknown theme", () => {
    setTheme("nonexistent-theme");
    expect(theme.primary).toBe("#ff7a45");
  });

  test("temper-forge has correct primary color", () => {
    setTheme("temper-forge");
    expect(theme.primary).toBe("#ff7a45");
  });
});

describe("getStatusStyle", () => {
  beforeEach(() => {
    setTheme("temper-forge");
  });

  test("available returns green check", () => {
    const style = getStatusStyle("available");
    expect(style.icon).toBe("✓");
    expect(style.color).toBe(theme.green);
  });

  test("taken returns red cross", () => {
    const style = getStatusStyle("taken");
    expect(style.icon).toBe("✗");
    expect(style.color).toBe(theme.red);
  });

  test("premium returns diamond", () => {
    const style = getStatusStyle("premium");
    expect(style.icon).toBe("◆");
    expect(style.color).toBe(theme.peach);
  });

  test("reserved returns circle", () => {
    const style = getStatusStyle("reserved");
    expect(style.icon).toBe("◉");
    expect(style.color).toBe(theme.sapphire);
  });

  test("slow returns warning", () => {
    const style = getStatusStyle("slow");
    expect(style.icon).toBe("⚠");
  });

  test("error returns red cross", () => {
    const style = getStatusStyle("error");
    expect(style.icon).toBe("✗");
    expect(style.color).toBe(theme.red);
  });
});
