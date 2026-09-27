import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { npmRuntimeFiles, verifyNpmIdentity } from "./npm-build-record.ts";

test("npm identity covers every chunk and rejects missing, altered or stale output", () => {
  const root = mkdtempSync(join(tmpdir(), "temper-npm-identity-"));
  try {
    mkdirSync(join(root, "chunks"));
    writeFileSync(join(root, "index.js"), 'import "./chunks/catalog.js";');
    writeFileSync(join(root, "chunks/catalog.js"), 'export const data = "catalog";');
    const record = { snapshot: "source", files: npmRuntimeFiles(root) };
    expect(() => verifyNpmIdentity(record, "source", root)).not.toThrow();
    writeFileSync(join(root, "SOURCE.md"), "generated after build");
    expect(() => verifyNpmIdentity(record, "source", root)).not.toThrow();
    expect(() => verifyNpmIdentity(record, "other", root)).toThrow("source differs");
    writeFileSync(join(root, "chunks/catalog.js"), "tampered");
    expect(() => verifyNpmIdentity(record, "source", root)).toThrow("build record");
    rmSync(join(root, "chunks/catalog.js"));
    expect(() => verifyNpmIdentity(record, "source", root)).toThrow("build record");
    writeFileSync(join(root, "chunks/catalog.js"), 'export const data = "catalog";');
    writeFileSync(join(root, "old.js"), "stale chunk");
    expect(() => verifyNpmIdentity(record, "source", root)).toThrow("build record");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
