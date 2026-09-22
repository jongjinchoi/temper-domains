import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './core.ts';

async function withHome(work: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), 'temper-media-fixture-'));
  try {
    await writeFile(join(home, '.temper-media-home'), 'test');
    await work(home);
  } finally { await rm(home, { recursive: true, force: true }); }
}
function execute(home: string, args: string[], scenario = '') {
  return Bun.spawnSync([process.execPath, '--preload', join(ROOT, 'scripts/media/preload.ts'), ...args], {
    cwd: ROOT, env: { ...process.env, TEMPER_MEDIA_HOME: home, TEMPER_MEDIA_SCENARIO: scenario },
  });
}

test('recording fixture drives the actual CLI with registered and not-found responses', async () => {
  await withHome(async home => {
    const result = execute(home, ['src/index.ts', 'search', 'gethalden', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const rows = JSON.parse(result.stdout.toString());
    expect(rows).toHaveLength(30);
    expect(rows.find((r: { domain: string }) => r.domain === 'gethalden.com').status).toBe('taken');
    expect(rows.find((r: { domain: string }) => r.domain === 'gethalden.dev').status).toBe('available');
    expect((await readFile(join(home, 'requests.log'), 'utf8')).trim().split('\n')).toHaveLength(30);
  });
});

test('a synthetic failed lookup remains an error in the actual CLI', async () => {
  await withHome(async home => {
    const result = execute(home, ['src/index.ts', 'search', 'gethalden', '--format', 'json'], 'partial');
    expect(result.exitCode).toBe(0);
    const rows = JSON.parse(result.stdout.toString());
    expect(rows).toHaveLength(30);
    expect(rows.find((r: { domain: string }) => r.domain === 'gethalden.dev').status).toBe('error');
  });
});

test('unexpected HTTP, WHOIS, browser and installer calls are blocked and recorded', async () => {
  await withHome(async home => {
    const result = execute(home, ['--eval', `
      const { whoisLookup } = await import('./src/checker/whois.ts');
      const { openBrowser } = await import('./src/registrar/browser.ts');
      const { performUpdate } = await import('./src/update/runner.ts');
      for (const operation of [() => fetch('https://example.com/'), () => whoisLookup(), () => openBrowser(), () => performUpdate()]) {
        try { await operation(); throw new Error('not blocked'); }
        catch (error) { if (!String(error).includes('Recording blocked')) throw error; }
      }
    `]);
    expect(result.exitCode).toBe(0);
    expect((await readFile(join(home, 'blocked.log'), 'utf8')).trim().split('\n')).toHaveLength(4);
  });
});

test('local embedded WASM data remains readable without a network request', async () => {
  await withHome(async home => {
    const result = execute(home, ['--eval', `
      const response = await fetch('data:application/octet-stream;base64,AGFzbQ==');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== 4 || bytes[1] !== 97) throw new Error('invalid embedded bytes');
    `]);
    expect(result.exitCode).toBe(0);
  });
});
