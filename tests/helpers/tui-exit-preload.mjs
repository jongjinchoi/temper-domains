import '../runtime/preload.mjs';
import fs from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

// Keep real transactions; stop one I/O boundary until the PTY observes unmount.
const home = process.env.TEMPER_TEST_HOME;
const target = join(home, '.temper', process.env.TEMPER_GATE_TARGET ?? 'unused');
const phase = process.env.TEMPER_GATE_PHASE;
const original = { ...fs };
let gated = false;
async function gate(at, path) {
  if (gated || at !== phase || String(path) !== target) return;
  gated = true;
  writeFileSync(join(home, 'gate-entered'), at);
  const deadline = Date.now() + 8000;
  while (!existsSync(join(home, 'gate-release'))) {
    if (Date.now() > deadline) throw new Error('PTY did not release transaction gate');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
const changed = { ...original,
  open: async (...args) => {
    const handle = await original.open(...args);
    if (String(args[0]) === target + '.lock') {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (...values) => { await gate('lock-write', target); return write(...values); };
    }
    return handle;
  },
  rename: async (...args) => { await gate('rename', args[1]); return original.rename(...args); },
  unlink: async (...args) => {
    if (String(args[0]).endsWith('.lock')) await gate('cleanup', String(args[0]).slice(0, -5));
    return original.unlink(...args);
  },
  readFile: async (...args) => {
    if (process.env.TEMPER_CONFIG_DENIED && String(args[0]) === join(home, '.temper/config.json')) {
      throw Object.assign(new Error('controlled config read denied'), { code: 'EACCES' });
    }
    return original.readFile(...args);
  },
};
Object.assign(fs, changed);
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import('bun:test');
  mock.module('node:fs/promises', () => changed);
}
const { homedir } = await import('node:os');
if (homedir() !== home) throw new Error('Test home isolation failed before CLI startup');
