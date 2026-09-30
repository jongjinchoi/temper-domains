// Diagnostic only, never a pass/fail check: which errors the lock and replace steps
// of a file transaction meet when several processes contend, on this platform and
// runtime. Works in its own temporary directory with Node's file API alone.
import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const code = error => error?.code ?? error?.name ?? String(error);
const count = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };
const attempt = (counts, step, action) => action().then(value => { count(counts, `${step}:ok`); return value; },
  error => { count(counts, `${step}:${code(error)}`); return undefined; });
const [role, target, rounds] = process.argv.slice(2);

// Same order as withFileTransaction: create the lock, write the PID, close, remove.
if (role === 'lock') {
  const counts = {}, recoveries = [];
  // Each process completes the given number of lock cycles, within a bounded number of attempts.
  for (let attempts = 0; (counts['open:ok'] ?? 0) < Number(rounds) && attempts < Number(rounds) * 40; attempts++) {
    let lock;
    try { lock = await open(target, 'wx', 0o600); count(counts, 'open:ok'); }
    catch (error) {
      count(counts, `open:${code(error)}`);
      if (code(error) === 'EEXIST') await delay(1);
      else if (recoveries.length < 5) {
        // Is the refusal momentary? Record the path's state, then when a new attempt changes.
        const seen = await stat(target).then(() => 'exists', failure => code(failure));
        const retries = [];
        for (const wait of [0, 1, 5, 25, 100]) {
          await delay(wait);
          const result = await open(target, 'wx', 0o600).then(async handle => { await handle.close(); await unlink(target).catch(() => {}); return 'ok'; }, code);
          retries.push(`${wait}ms=${result}`);
          if (result === 'ok' || result === 'EEXIST') break;
        }
        recoveries.push(`${code(error)} stat=${seen} ${retries.join(' ')}`);
      }
      continue;
    }
    await attempt(counts, 'write', () => lock.writeFile(`${process.pid}\n`));
    await attempt(counts, 'close', () => lock.close());
    await attempt(counts, 'unlink', () => unlink(target));
  }
  console.log(JSON.stringify({ counts, recoveries }));
} else if (role === 'replace') {
  // The replace step: a finished temporary file renamed over the target.
  const counts = {};
  for (let i = 0; i < Number(rounds); i++) {
    const temporary = `${target}.${process.pid}.${i}.tmp`;
    const written = counts['write:ok'] ?? 0;
    await attempt(counts, 'write', () => writeFile(temporary, `{"round":${i}}\n`, { flag: 'wx' }));
    if ((counts['write:ok'] ?? 0) === written) continue;
    await attempt(counts, 'rename', () => rename(temporary, target));
    await unlink(temporary).catch(() => {});
  }
  console.log(JSON.stringify({ counts }));
} else if (role === 'read') {
  const counts = {};
  for (let i = 0; i < Number(rounds); i++) await attempt(counts, 'read', () => readFile(target, 'utf8'));
  console.log(JSON.stringify({ counts }));
} else {
  const self = fileURLToPath(import.meta.url);
  const child = (...args) => new Promise(resolve => {
    const process_ = spawn(process.execPath, [self, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    process_.stdout.on('data', chunk => { stdout += chunk; });
    process_.stderr.on('data', chunk => { stderr += chunk; });
    process_.on('error', error => resolve(`spawn ${code(error)}`));
    process_.on('exit', status => resolve(stdout.trim() || `exit ${status}: ${stderr.trim().slice(0, 300)}`));
  });
  const merge = outputs => {
    const counts = {}, recoveries = [], other = [];
    for (const output of outputs) {
      try {
        const parsed = JSON.parse(output);
        for (const [key, value] of Object.entries(parsed.counts)) counts[key] = (counts[key] ?? 0) + value;
        recoveries.push(...(parsed.recoveries ?? []));
      } catch { other.push(output); }
    }
    return JSON.stringify({ counts: Object.fromEntries(Object.entries(counts).sort()), ...(recoveries.length ? { recoveries } : {}), ...(other.length ? { other } : {}) });
  };
  const report = (label, value) => console.log(`${label}: ${value}`);
  const directory = await mkdtemp(join(tmpdir(), 'temper-lock-probe-'));
  try {
    report('runtime', `${process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`} on ${process.platform}`);

    // A name removed while another handle is still open: can it be created again at once?
    const held = join(directory, 'held.lock');
    const owner = await open(held, 'wx', 0o600);
    const second = await open(held, 'r');
    await owner.close();
    report('unlink with a second handle open', await unlink(held).then(() => 'ok', code));
    report('create while that handle is open', await open(held, 'wx', 0o600).then(async handle => { await handle.close(); return 'ok'; }, code));
    await second.close();
    await unlink(held).catch(() => {});
    report('create after the handle is closed', await open(held, 'wx', 0o600).then(async handle => { await handle.close(); await unlink(held); return 'ok'; }, code));

    const lock = join(directory, 'state.json.lock');
    report('4 processes x 150 lock cycles', merge(await Promise.all([1, 2, 3, 4].map(() => child('lock', lock, '150')))));

    const data = join(directory, 'state.json');
    await writeFile(data, '{}\n');
    const [writers, readers] = await Promise.all([
      Promise.all([1, 2].map(() => child('replace', data, '200'))),
      Promise.all([1, 2].map(() => child('read', data, '2000'))),
    ]);
    report('2 writers x 200 replacements', merge(writers));
    report('2 readers x 2000 reads meanwhile', merge(readers));
  } catch (error) {
    report('probe stopped', `${code(error)}: ${error?.message}`);
  } finally { await rm(directory, { recursive: true, force: true }).catch(() => {}); }
}
