import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileExists, readJson, writeJson, fileStat } from "./fs.ts";

describe("fs utils", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "temper-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  describe("fileExists", () => {
    test("returns false for non-existent file", async () => {
      expect(await fileExists(join(tmpDir, "nope.json"))).toBe(false);
    });

    test("returns true for existing file", async () => {
      const path = join(tmpDir, "exists.json");
      await writeJson(path, {});
      expect(await fileExists(path)).toBe(true);
    });
  });

  describe("writeJson + readJson", () => {
    test("roundtrip object", async () => {
      const path = join(tmpDir, "test.json");
      const data = { foo: "bar", count: 42 };
      await writeJson(path, data);
      const result = await readJson(path);
      expect(result).toEqual(data);
    });

    test("roundtrip array", async () => {
      const path = join(tmpDir, "arr.json");
      const data = [1, 2, 3];
      await writeJson(path, data);
      const result = await readJson(path);
      expect(result).toEqual(data);
    });

    test("readJson returns null for non-existent file", async () => {
      expect(await readJson(join(tmpDir, "nope.json"))).toBeNull();
    });
  });

  describe("fileStat", () => {
    test("returns stat for existing file", async () => {
      const path = join(tmpDir, "stat.json");
      await writeJson(path, { test: true });
      const stat = await fileStat(path);
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtime).toBeInstanceOf(Date);
    });
  });
});
