import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sourceIdentity, SOURCE_REPOSITORY } from './source-revision.mjs';

const ROOT_FILES = new Set(['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'build.ts', 'build-npm.ts', 'README.md', 'LICENSE', 'SOURCE.md', 'THIRD_PARTY_NOTICES.md', 'AGENTS.md', '.gitignore']);
export function permittedSource(path: string): boolean {
  if (path.startsWith('/') || path.split('/').some(p => ['..', 'node_modules', '.next', '.vercel', '.git', 'dist', 'out', '.cache'].includes(p) || p.startsWith('.env')) || /(?:\.pem|\.key|\.tsbuildinfo)$/.test(path)) return false;
  return ROOT_FILES.has(path) || /^(src|scripts|tests|assets|docs|legal|data-sources|\.github\/workflows)\//.test(path) || /^web\//.test(path);
}

// This snapshot includes build scripts, lockfile, generated data AND its saved inputs.
// It never obtains network resources or installs packages.
export function collectSource(root = resolve(import.meta.dir, '..'), publicBuild = false) {
  const identity = sourceIdentity(root, { publicBuild, includePath: permittedSource });
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  let listed: string[];
  if (identity.revision) {
    listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  } else {
    const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (!permittedSource(entry.isDirectory() ? `${path}/` : path) && !(entry.isDirectory() && path === '.github')) return [];
      return entry.isDirectory() ? walk(path) : [path];
    });
    listed = walk('');
  }
  const paths = [...new Set(listed)].filter(permittedSource).filter(p => existsSync(join(root, p))).sort();
  const hashes: Record<string, string> = {};
  for (const path of paths) {
    if (!lstatSync(join(root, path)).isFile()) throw new Error(`Source must be a regular file: ${path}`);
    hashes[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  }
  const snapshot = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  return { identity, pkg, paths, hashes, snapshot };
}

export function prepareSource(root = resolve(import.meta.dir, '..'), runtime = Bun.version) {
  const { identity, pkg, paths, hashes, snapshot } = collectSource(root, process.env.TEMPER_PUBLIC_BUILD === '1');
  for (const required of ['src/index.ts', 'bun.lock', 'build.ts', 'build-npm.ts', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'legal/inventory.json', 'data-sources/catalog/public_suffix_list.dat']) {
    if (!paths.includes(required)) throw new Error(`Corresponding source lacks ${required}`);
  }
  const stage = mkdtempSync(join(tmpdir(), 'temper-source-'));
  try {
    for (const path of paths) {
      if (!lstatSync(join(root, path)).isFile()) throw new Error(`Source must be a regular file: ${path}`);
      const bytes = readFileSync(join(root, path));
      if (hashes[path] !== createHash('sha256').update(bytes).digest('hex')) throw new Error(`Source changed during packaging: ${path}`);
      mkdirSync(dirname(join(stage, path)), { recursive: true });
      writeFileSync(join(stage, path), bytes, { mode: lstatSync(join(root, path)).mode });
    }
    const id = identity.dirty ? `local-${snapshot}` : identity.revision!;
    const archiveName = `temper-source-${id}.tar.gz`;
    const sourceArchive = identity.dirty ? null : `${SOURCE_REPOSITORY}/releases/download/v${pkg.version}/${archiveName}`;
    const manifest = { ...identity, version: pkg.version, bun: runtime, snapshot, sourceArchive, files: hashes };
    writeFileSync(join(stage, 'SOURCE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
    const output = join(root, 'dist'); mkdirSync(output, { recursive: true });
    execFileSync('tar', ['-czf', join(output, archiveName), '-C', stage, '.']);
    const description = `# Corresponding source\n\nVersion: ${pkg.version}\n\n${identity.dirty ? 'LOCAL WORKTREE SNAPSHOT — not a published revision.' : `Build commit: ${identity.revision}`}\n\nSnapshot SHA-256: ${snapshot}\n\n${sourceArchive ? `Download: ${sourceArchive}\n\nBrowse: ${identity.sourceUrl}` : `Local archive: ${archiveName}`}\n\nBuild runtime: Bun ${runtime}.\n\nThe archive includes the source, dependency lockfile, build scripts, catalog inputs,\nlicense texts and third-party notices. See docs/licensing.md for rebuild commands,\nexternal dependency sources and the separate Bun runtime review boundary.\n\nExisting Apache releases are unchanged. Temper code in this snapshot uses\nAGPL-3.0-only; third-party components retain their own conditions.\n`;
    writeFileSync(join(output, 'SOURCE.md'), description);
    writeFileSync(join(output, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return { description, manifest, archive: join(output, archiveName) };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

export function nativeBinaryName(target: string) {
  return `temper-${target}${target === 'bun-windows-x64' ? '.exe' : ''}`;
}

export function verifyNativeIdentity(record: { snapshot: string; binarySha256: string; bun: string }, snapshot: string, binary: Uint8Array) {
  if (record.snapshot !== snapshot) throw new Error('Native binary source differs from the packaging source; rebuild it');
  if (record.binarySha256 !== createHash('sha256').update(binary).digest('hex')) throw new Error('Native binary differs from its build record');
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!/^bun-(darwin-(arm64|x64)|linux-(arm64|x64)|windows-x64)$/.test(target ?? '')) throw new Error('Supply a supported Bun target');
  const root = resolve(import.meta.dir, '..'), stage = mkdtempSync(join(tmpdir(), 'temper-binary-'));
  const executable = target!.includes('windows') ? 'temper.exe' : 'temper';
  try {
    const binaryPath = join(root, 'dist/bin', nativeBinaryName(target!));
    const record = JSON.parse(readFileSync(`${binaryPath}.source.json`, 'utf8'));
    const { description, manifest } = prepareSource(root, record.bun);
    verifyNativeIdentity(record, manifest.snapshot, readFileSync(binaryPath));
    copyFileSync(binaryPath, join(stage, executable));
    for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) copyFileSync(join(root, path), join(stage, path));
    writeFileSync(join(stage, 'SOURCE.md'), description);
    execFileSync('tar', ['-czf', join(root, 'dist', `temper-${target}.tar.gz`), '-C', stage, executable, 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE.md']);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
