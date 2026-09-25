import { test, expect } from 'bun:test';
import { permittedSource, nativeBinaryName, verifyNativeIdentity } from './source-package.ts';
import { createHash } from 'node:crypto';

test('source snapshot allows build inputs but excludes secrets and installed dependencies', () => {
  for (const path of ['build-npm.ts', 'bun.lock', 'src/index.ts', 'web/next.config.mjs', '.github/workflows/release.yml', 'data-sources/catalog/roots.txt']) expect(permittedSource(path)).toBe(true);
  for (const path of ['.env', 'web/.env.production', 'web/node_modules/react/index.js', 'web/.next/server.js', '../secret', '/etc/passwd', 'web/key.pem', 'notes/private.md']) expect(permittedSource(path)).toBe(false);
});

test('native package cannot pair stale or changed binaries with a new source snapshot', () => {
  const binary = Buffer.from('controlled fixture'), record = {snapshot:'source-a',bun:Bun.version,binarySha256:createHash('sha256').update(binary).digest('hex')};
  expect(() => verifyNativeIdentity(record, 'source-a', binary)).not.toThrow();
  expect(() => verifyNativeIdentity(record, 'source-b', binary)).toThrow('source differs');
  expect(() => verifyNativeIdentity(record, 'source-a', Buffer.from('changed'))).toThrow('build record');
  expect(() => verifyNativeIdentity({...record,bun:'different'}, 'source-a', binary)).toThrow('runtime differs');
  expect(nativeBinaryName('bun-windows-x64')).toBe('temper-bun-windows-x64.exe');
  expect(nativeBinaryName('bun-darwin-arm64')).toBe('temper-bun-darwin-arm64');
});
