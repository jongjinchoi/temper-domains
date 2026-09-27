import { mock } from 'bun:test';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const [file, mode] = process.argv.slice(2) as [string, string];
if (!file || !mode || resolve(file).startsWith(resolve('src'))) throw new Error('Supply an isolated catalog fixture');
const runtime = join(dirname(file), 'runtime-catalog.json');
const originalWrite = fs.writeFile;
const originalRename = fs.rename;
let injected = false;
mock.module('node:fs/promises', () => ({ ...fs,
  writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
    const target = String(args[0]);
    if ((mode === 'write-full' && target.startsWith(`${file}.`)) || (mode === 'write-runtime' && target.startsWith(`${runtime}.`))) {
      injected = true;
      await originalWrite(args[0], '{partial', args[2]);
      throw new Error(`Injected ${mode}`);
    }
    return originalWrite(...args);
  },
  rename: async (...args: Parameters<typeof fs.rename>) => {
    const target = String(args[1]);
    if (mode === 'interrupt' && target === runtime) {
      process.stdout.write('READY\n');
      await new Promise(() => { setInterval(() => {}, 1000); });
    }
    if ((mode === 'rename-full' && target === file) || (mode === 'rename-runtime' && target === runtime)) {
      injected = true;
      throw new Error(`Injected ${mode}`);
    }
    return originalRename(...args);
  },
}));

const request = JSON.parse(await fs.readFile(join(dirname(file), 'request.json'), 'utf8'));
const { refreshCatalog } = await import('../../scripts/update-extension-catalog.ts');
try {
  await refreshCatalog(file, async () => { throw new Error('Offline fixture'); }, new Date('2026-09-22'), request.root, request.psl, request.rdap, request.evidence);
  throw new Error('Publication unexpectedly succeeded');
} catch (error) {
  if (!injected) throw error;
  console.log(JSON.stringify({ error: (error as Error).message }));
}
