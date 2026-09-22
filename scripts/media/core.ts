import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dir, '../..');
export const MANIFEST = 'assets/screenshots/manifest.json';
export const TAPES = ['demo', 'search', 'suggest', 'registrar', 'init', 'themes', 'theme-catppuccin-latte', 'theme-rose-pine-dawn'];
export const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export function snapshot(root: string, paths: string[]): Record<string, string | null> {
  return Object.fromEntries([...paths].sort().map(path => [path, existsSync(join(root, path)) ? digest(readFileSync(join(root, path))) : null]));
}
export function outputPaths(tapes: string[]): string[] {
  const paths = tapes.flatMap(tape => [...tape.matchAll(/^(?:Output|Screenshot)\s+(\S+)\s*$/gm)].map(m => m[1]!));
  for (const path of paths) if (!/^assets\/screenshots\/[a-z0-9-]+\.(png|gif)$/.test(path)) throw new Error(`Invalid media output: ${path}`);
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate media output');
  return paths.sort();
}
export function tapeSources(root = ROOT): string[] {
  return TAPES.map(name => readFileSync(join(root, `assets/tape/${name}.tape`), 'utf8'));
}
function files(root: string, path: string): string[] {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(root, `${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
export function inputHashes(root = ROOT) {
  const paths = ['src/index.ts', 'src/version.ts', 'package.json', 'bun.lock',
    ...['src/checker', 'src/config', 'src/tui', 'src/registrar', 'src/utils', 'scripts/media', 'assets/tape'].flatMap(path => files(root, path))]
    .filter(path => !path.endsWith('.test.ts'));
  return snapshot(root, paths);
}
export function mediaInfo(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length >= 33) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) && bytes.length >= 14 && bytes.at(-1) === 59) {
    return { format: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  throw new Error('Invalid PNG/GIF header or incomplete GIF');
}
export interface CaptureManifest {
  schema: 1;
  sourceCommit: string;
  capturedAt: string;
  mode: 'current-source-with-synthetic-rdap';
  runtime: Record<string, string>;
  inputs: Record<string, string | null>;
  outputs: Record<string, { sha256: string; format: string; width: number; height: number }>;
}
export function checkManifest(manifest: CaptureManifest, mediaRoot = ROOT, sourceRoot = ROOT) {
  if (manifest.schema !== 1 || manifest.mode !== 'current-source-with-synthetic-rdap') throw new Error('Unknown capture manifest');
  if (JSON.stringify(manifest.inputs) !== JSON.stringify(inputHashes(sourceRoot))) throw new Error('Capture inputs changed: regenerate media');
  const outputs = outputPaths(tapeSources(sourceRoot));
  if (outputs.length !== 19 || JSON.stringify(Object.keys(manifest.outputs).sort()) !== JSON.stringify(outputs)) throw new Error('Expected all 19 media outputs');
  for (const path of outputs) {
    const bytes = readFileSync(join(mediaRoot, path));
    const info = mediaInfo(bytes), entry = manifest.outputs[path]!;
    if (digest(bytes) !== entry.sha256 || info.format !== entry.format || info.width !== entry.width || info.height !== entry.height || !info.width || !info.height) throw new Error(`Media differs from capture: ${path}`);
  }
}

// Copy only after complete validation; restore the original bytes if a copy fails.
// This is rollback for ordinary I/O failures, not a crash-atomic multi-file transaction.
export async function promote(stage: string, target: string, paths: string[], baseline: Record<string, string | null>, copy = copyFile) {
  if (JSON.stringify(snapshot(target, paths)) !== JSON.stringify(baseline)) throw new Error('Destination changed since capture; refusing to overwrite');
  const originals = new Map<string, Buffer | null>();
  for (const path of paths) {
    await readFile(join(stage, path)); // A missing staged file must fail before the first write.
    originals.set(path, existsSync(join(target, path)) ? await readFile(join(target, path)) : null);
  }
  const backup = await mkdtemp(join(stage, 'originals-'));
  for (const [path, bytes] of originals) {
    if (bytes !== null) {
      await mkdir(dirname(join(backup, path)), { recursive: true });
      await writeFile(join(backup, path), bytes);
    }
  }
  await writeFile(join(backup, 'baseline.json'), JSON.stringify(baseline, null, 2));
  const attempted: string[] = [];
  try {
    for (const path of paths) {
      await mkdir(dirname(join(target, path)), { recursive: true });
      attempted.push(path);
      await copy(join(stage, path), join(target, path));
    }
  } catch (error) {
    const failures: unknown[] = [];
    for (const path of attempted.reverse()) {
      const bytes = originals.get(path)!;
      try {
        if (bytes === null) await rm(join(target, path), { force: true });
        else await writeFile(join(target, path), bytes);
      } catch (restoreError) { failures.push(restoreError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], `Copy and rollback failed; originals retained in ${backup}`);
    throw error;
  }
}
