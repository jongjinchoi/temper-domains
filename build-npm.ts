import { verifyBundledCheckerSignatures } from "./scripts/checker-fingerprint.ts";
import { readFile, writeFile, rm } from "node:fs/promises";
import { collectSource } from "./scripts/source-package.ts";
import { npmRuntimeFiles } from "./scripts/npm-build-record.ts";

await verifyBundledCheckerSignatures();
const source = collectSource();

const pkg = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };

// Only generated npm output is replaced; old content-hashed chunks must not ship.
await rm("./dist/npm", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist/npm",
  target: "node",
  format: "esm",
  splitting: true,
  packages: "external",
  sourcemap: "linked",
  define: {
    "PKG_VERSION": JSON.stringify(pkg.version),
  },
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}
if (collectSource().snapshot !== source.snapshot) throw new Error('Source changed during npm build');

// Add shebang to dist/npm/index.js
const indexPath = "./dist/npm/index.js";
const content = await readFile(indexPath, "utf-8");
if (!content.startsWith("#!/")) {
  await writeFile(indexPath, "#!/usr/bin/env node\n" + content);
}

console.log("✓ dist/npm/index.js");
await writeFile('./dist/npm-build.json', JSON.stringify({ snapshot: source.snapshot, bun: Bun.version,
  files: npmRuntimeFiles('./dist/npm') }) + '\n');
