import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { VERSION } from "./version.ts";

describe("VERSION", () => {
  test("matches package.json during source execution", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf-8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
