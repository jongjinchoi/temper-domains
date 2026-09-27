import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function npmRuntimeFiles(root: string): Record<string, string> {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (/\.js(?:\.map)?$/.test(path)) {
        if (!entry.isFile()) throw new Error(`npm output must be a regular file: ${path}`);
        files.push(path);
      }
    }
  };
  walk("");
  if (!files.includes("index.js")) throw new Error("npm build record requires index.js");
  return Object.fromEntries(files.sort().map(path => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
}

export function verifyNpmIdentity(record: { snapshot: string; files: Record<string, string> }, snapshot: string, root: string) {
  if (record.snapshot !== snapshot) throw new Error("npm source differs from the packaging source; rebuild it");
  if (JSON.stringify(record.files) !== JSON.stringify(npmRuntimeFiles(root))) throw new Error("npm runtime files differ from their build record; rebuild all chunks");
}
