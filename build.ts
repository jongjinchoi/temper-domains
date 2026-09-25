import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { verifyBundledCheckerSignatures } from "./scripts/checker-fingerprint.ts";
import { nativeBinaryName, prepareSource } from "./scripts/source-package.ts";

await verifyBundledCheckerSignatures();
const source = prepareSource();

const pkg = JSON.parse(await readFile("./package.json", "utf-8")) as { version: string };

const TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
] as const;

const target = process.argv[2];

const buildTargets = target
  ? TARGETS.filter((t) => t === target)
  : TARGETS;

if (buildTargets.length === 0) {
  console.error(`Unknown target: ${target}`);
  console.error(`Available: ${TARGETS.join(", ")}`);
  process.exit(1);
}

for (const t of buildTargets) {
  console.log(`Building ${t}...`);
  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: t,
      outfile: `./dist/bin/${nativeBinaryName(t)}`,
    },
    minify: true,
    sourcemap: "linked",
    define: {
      "PKG_VERSION": JSON.stringify(pkg.version),
    },
  });

  if (result.success) {
    if (prepareSource().manifest.snapshot !== source.manifest.snapshot) throw new Error('Source changed during native build');
    const binary = `./dist/bin/${nativeBinaryName(t)}`;
    await writeFile(`${binary}.source.json`, JSON.stringify({ snapshot: source.manifest.snapshot, bun: Bun.version, binarySha256: createHash('sha256').update(await readFile(binary)).digest('hex') }) + '\n');
    console.log(`  ✓ dist/bin/temper-${t}`);
  } else {
    console.error(`  ✗ Failed:`, result.logs);
    process.exit(1);
  }
}

console.log("\nDone.");
