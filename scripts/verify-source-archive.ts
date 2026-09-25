import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function verifySourceArchive(manifestPath: string, archivePath: string) {
  const local = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const archive = resolve(archivePath);
  const tar = (...args: string[]) => execFileSync('tar', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const names = tar('-tzf', archive).trim().split('\n');
  for (const name of names) {
    const path = name.replace(/^\.\//, '');
    if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new Error(`Unsafe source archive path: ${name}`);
    if (path && !path.endsWith('/') && path !== 'SOURCE-MANIFEST.json' && !Object.hasOwn(local.files, path)) throw new Error(`Unexpected source archive file: ${name}`);
  }
  if (tar('-tvzf', archive).trim().split('\n').some(line => !['-', 'd'].includes(line[0]!))) throw new Error('Source archive contains a non-regular file');
  const stage = mkdtempSync(join(tmpdir(), 'temper-verify-source-'));
  try {
    tar('-xzf', archive, '-C', stage);
    const remote = JSON.parse(readFileSync(join(stage, 'SOURCE-MANIFEST.json'), 'utf8'));
    if (remote.revision !== local.revision || remote.snapshot !== local.snapshot || remote.dirty || local.dirty
      || JSON.stringify(remote.files) !== JSON.stringify(local.files)) throw new Error('Published source does not match this build');
    for (const [path, hash] of Object.entries(local.files)) {
      if (createHash('sha256').update(readFileSync(join(stage, path))).digest('hex') !== hash) throw new Error(`Published source file differs: ${path}`);
    }
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const [, , manifest, archive] = process.argv;
  if (!manifest || !archive) throw new Error('Usage: verify-source-archive.ts <manifest> <archive>');
  verifySourceArchive(manifest, archive);
  console.log('Published source files match the packaged source.');
}
