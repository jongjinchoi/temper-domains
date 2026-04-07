import { readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist/npm",
  target: "node",
  format: "esm",
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

// Add shebang to dist/npm/index.js
const indexPath = "./dist/npm/index.js";
const content = await readFile(indexPath, "utf-8");
if (!content.startsWith("#!/")) {
  await writeFile(indexPath, "#!/usr/bin/env node\n" + content);
}

console.log("✓ dist/npm/index.js");
