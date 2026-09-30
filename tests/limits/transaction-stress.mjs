// Diagnostic only, never a pass/fail check: how often the real file transactions fail
// when several temper processes use the same files at once. Needs the Node test
// runtime (bun build tests/runtime/entry.ts ... --outfile=dist/test-runtime/entry.js).
// Works in its own temporary home; children refuse to run with any other home.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [role, home, arg, stopFile] = process.argv.slice(2);
const entry = pathToFileURL(resolve('dist/test-runtime/entry.js')).href;
const describe = error => String(error?.message ?? error).replace(/[A-Z]:\\[^\s']*|\/[^\s']*temper-stress-[^\s']*/g, '<path>').slice(0, 160);
const tally = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

if (role) {
  // Never touch a real home: the parent passes HOME and USERPROFILE for this run.
  if (homedir() !== home) {
    console.log(JSON.stringify({ refused: `home is ${homedir()}, expected the temporary home` }));
    process.exit(0);
  }
  const { loadConfig, saveConfig, FileLimitStore, LimitCoordinator } = await import(entry);
  const counts = {}, errors = {};
  const run = async (step, action) => {
    try { await action(); tally(counts, `${step}:ok`); }
    catch (error) { tally(counts, `${step}:failed`); tally(errors, `${error?.name}: ${describe(error)}`); }
  };
  if (role === 'config-writer') {
    for (let i = 0; i < Number(arg); i++) await run('save', () => saveConfig({ theme: i % 2 ? 'dracula' : 'temper-forge' }));
  } else if (role === 'config-reader') {
    const started = Date.now();
    while (Date.now() - started < 30000 && !await access(stopFile).then(() => true, () => false)) {
      for (let i = 0; i < 20; i++) await run('load', () => loadConfig());
    }
  } else if (role === 'limits') {
    const limits = new LimitCoordinator(new FileLimitStore(join(home, 'lookup-limits.json')));
    for (let i = 0; i < Number(arg); i++) {
      await run('acquire+release', async () => {
        const admission = await limits.tryAcquire(`https://stress-${process.pid}-${i}.test`, Date.now() + 10000, AbortSignal.timeout(10000));
        if (!admission.permit) throw new Error(`no permit: wait ${admission.wait}`);
        await admission.permit.release();
      });
    }
  }
  console.log(JSON.stringify({ counts, errors }));
} else {
  const self = fileURLToPath(import.meta.url);
  const directory = await mkdtemp(join(tmpdir(), 'temper-stress-'));
  const child = (...args) => new Promise(done => {
    const process_ = spawn(process.execPath, [self, ...args], { env: { ...process.env, HOME: directory, USERPROFILE: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    process_.stdout.on('data', chunk => { stdout += chunk; });
    process_.stderr.on('data', chunk => { stderr += chunk; });
    process_.on('error', error => done(`spawn ${error.code}`));
    process_.on('exit', status => done(stdout.trim().split('\n').at(-1) || `exit ${status}: ${stderr.trim().slice(0, 300)}`));
  });
  const merge = outputs => {
    const counts = {}, errors = {}, other = [];
    for (const output of outputs) {
      try {
        const parsed = JSON.parse(output);
        if (parsed.refused) { other.push(parsed.refused); continue; }
        for (const [key, value] of Object.entries(parsed.counts)) counts[key] = (counts[key] ?? 0) + value;
        for (const [key, value] of Object.entries(parsed.errors)) errors[key] = (errors[key] ?? 0) + value;
      } catch { other.push(output); }
    }
    return JSON.stringify({ counts, ...(Object.keys(errors).length ? { errors } : {}), ...(other.length ? { other } : {}) });
  };
  const report = (label, value) => console.log(`${label}: ${value}`);
  try {
    report('runtime', `${process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`} on ${process.platform}`);
    await access(fileURLToPath(entry)).catch(() => { throw new Error('Build dist/test-runtime/entry.js first'); });

    const stop = join(directory, 'stop');
    const readers = Promise.all([1, 2].map(() => child('config-reader', directory, '', stop)));
    const writers = await Promise.all([1, 2].map(() => child('config-writer', directory, '40')));
    await writeFile(stop, '');
    report('config: 2 writers x 40 saves', merge(writers));
    report('config: 2 readers meanwhile', merge(await readers));
    const final = await readFile(join(directory, '.temper', 'config.json'), 'utf8').then(text => { JSON.parse(text); return 'valid JSON'; }, error => `unreadable: ${error.code ?? error.message}`);
    report('config: final file', final);

    report('lookup limits: 4 processes x 100 acquire+release', merge(await Promise.all([1, 2, 3, 4].map(() => child('limits', directory, '100')))));
  } catch (error) {
    report('stress stopped', error?.message ?? String(error));
  } finally { await rm(directory, { recursive: true, force: true }).catch(() => {}); }
}
