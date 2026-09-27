import fs from 'node:fs/promises';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const home = process.env.TEMPER_TEST_HOME;
if (!home) throw new Error('TEMPER_TEST_HOME is required');
const original = { ...fs };
const failure = process.env.TEMPER_STORAGE_FAILURE;
let injected = 0;
const changed = { ...original,
  open: async (...args) => {
    const handle = await original.open(...args);
    if (failure === 'lock-write' && String(args[0]).endsWith('.lock')) {
      handle.writeFile = async () => { injected++; throw Object.assign(new Error('controlled PID write failure'), { code: 'ENOSPC' }); };
    }
    return handle;
  },
  unlink: async (...args) => {
    if (failure === 'unlink' && String(args[0]).endsWith('.lock')) {
      injected++;
      throw Object.assign(new Error('controlled lock unlink failure'), { code: 'EACCES' });
    }
    return original.unlink(...args);
  },
};
Object.assign(fs, changed);
os.homedir = () => home;
syncBuiltinESMExports();
if (process.versions.bun) {
  const { mock } = await import('bun:test');
  mock.module('node:fs/promises', () => changed);
  mock.module('node:os', () => os);
}
process.on('exit', () => console.error(`storage-injected=${injected}`));
