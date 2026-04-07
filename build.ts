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
      outfile: `./dist/bin/temper-${t}`,
    },
    minify: true,
    sourcemap: "linked",
  });

  if (result.success) {
    console.log(`  ✓ dist/bin/temper-${t}`);
  } else {
    console.error(`  ✗ Failed:`, result.logs);
    process.exit(1);
  }
}

console.log("\nDone.");
