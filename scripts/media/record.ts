import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkManifest, digest, inputHashes, MANIFEST, mediaInfo, outputPaths, promote, ROOT, snapshot, TAPES, tapeSources, type CaptureManifest } from './core.ts';

function run(cmd: string[], cwd = ROOT, env = process.env) {
  const result = Bun.spawnSync(cmd, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`${cmd[0]} exited ${result.exitCode}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.toString().trim();
}
const args = process.argv.slice(2);
if (args[0] === '--apply' && args.length === 2) {
  const stage = resolve(args[1]!);
  const manifest = JSON.parse(readFileSync(join(stage, MANIFEST), 'utf8')) as CaptureManifest;
  checkManifest(manifest, stage);
  const baseline = JSON.parse(readFileSync(join(stage, 'destination-before.json'), 'utf8'));
  await promote(stage, ROOT, [...outputPaths(tapeSources()), MANIFEST], baseline);
  console.log('Applied all 19 media files and their capture manifest.');
} else {
  if (args.length && !(args.length === 2 && args[0] === '--only' && TAPES.includes(args[1]!))) throw new Error('Usage: media:record [--only <tape> | --apply <reviewed-staging-directory>]');
  const selected = args.length ? [args[1]!] : TAPES;
  const sourceInputs = inputHashes();
  const stage = mkdtempSync(join(tmpdir(), 'temper-media-'));
  const paths = outputPaths(tapeSources());
  const baseline = snapshot(ROOT, [...paths, MANIFEST]);
  const userPaths = ['.temper/config.json', '.temper/history.json', '.temper/watchlist.json', '.temper/cache/rdap-dns.json', '.temper/cache/update.json'];
  const userBefore = snapshot(homedir(), userPaths);
  writeFileSync(join(stage, 'destination-before.json'), JSON.stringify(baseline, null, 2) + '\n');
  mkdirSync(join(stage, 'assets/screenshots'), { recursive: true });
  console.log(`Staging: ${stage}`);
  const tools = Object.fromEntries(['vhs', 'ffmpeg', 'ffprobe', 'ttyd', 'zsh', 'fc-match'].map(tool => {
    const path = Bun.which(tool);
    if (!path) throw new Error(`Missing recording tool: ${tool}; see docs/current.md`);
    return [tool, path];
  }));
  const font = run([tools['fc-match']!, '-f', '%{family}', 'Andale Mono']);
  if (font !== 'Andale Mono') throw new Error(`Required capture font Andale Mono is unavailable (resolved ${font})`);
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  try {
    for (const name of selected) {
      console.log(`Recording ${name}...`);
      const work = join(stage, name), home = join(work, 'home'), bin = join(work, 'bin');
      mkdirSync(home, { recursive: true }); mkdirSync(bin);
      writeFileSync(join(home, '.temper-media-home'), 'documentation capture\n');
      writeFileSync(join(home, '.zshrc'), "PROMPT='$ '\nRPROMPT=''\n");
      const wrapper = join(bin, 'temper');
      writeFileSync(join(bin, 'temper-media-session'), '#!/bin/sh\nexit 0\n');
      chmodSync(join(bin, 'temper-media-session'), 0o755);
      writeFileSync(wrapper, `#!/bin/sh\nexport TEMPER_MEDIA_HOME=${quote(home)}\nexport HOME=${quote(home)}\nexport TEMPER_NO_UPDATE_CHECK=1\nexec ${quote(process.execPath)} --preload ${quote(join(ROOT, 'scripts/media/preload.ts'))} ${quote(join(ROOT, 'src/index.ts'))} "$@"\n`);
      chmodSync(wrapper, 0o755);
      const env: Record<string, string | undefined> = { ...process.env, HOME: home, ZDOTDIR: home, XDG_CONFIG_HOME: join(home, '.config'), PATH: `${bin}:${process.env.PATH}`, TEMPER_NO_UPDATE_CHECK: '1', TEMPER_MEDIA_SCENARIO: '' };
      delete env.NODE_OPTIONS;
      const tape = join(work, `${name}.tape`);
      writeFileSync(tape, readFileSync(join(ROOT, `assets/tape/${name}.tape`)));
      const result = Bun.spawnSync([tools.vhs!, tape], { cwd: stage, env, stdout: 'pipe', stderr: 'pipe' });
      writeFileSync(join(work, 'vhs.log'), Buffer.concat([result.stdout, result.stderr]));
      if (result.exitCode !== 0) throw new Error(`${name} capture failed (${result.exitCode}); inspect ${work}/vhs.log`);
      if (existsSync(join(home, 'blocked.log'))) throw new Error(`Unexpected operation during ${name}; inspect ${home}/blocked.log`);
      for (const path of outputPaths([readFileSync(tape, 'utf8')])) {
        // Decode every frame before considering the recording usable.
        run([tools.ffmpeg!, '-v', 'error', '-xerror', '-i', join(stage, path), '-f', 'null', '-']);
      }
    }
    if (JSON.stringify(userBefore) !== JSON.stringify(snapshot(homedir(), userPaths))) throw new Error('User Temper files changed during capture; inspect before applying');
    if (JSON.stringify(sourceInputs) !== JSON.stringify(inputHashes())) throw new Error('Source changed during capture; re-record');
    if (selected.length === TAPES.length) {
      const manifest: CaptureManifest = {
        schema: 1, sourceCommit: run(['git', 'rev-parse', 'HEAD']), capturedAt: new Date().toISOString(), mode: 'current-source-with-synthetic-rdap',
        runtime: { bun: Bun.version, bunExecutable: process.execPath, entry: join(ROOT, 'src/index.ts'),
          vhs: run([tools.vhs!, '--version']), ffmpeg: run([tools.ffmpeg!, '-version']).split('\n')[0]!,
          ttyd: run([tools.ttyd!, '--version']), shell: run([tools.zsh!, '--version']), font },
        inputs: sourceInputs,
        outputs: Object.fromEntries(paths.map(path => {
          const bytes = readFileSync(join(stage, path));
          return [path, { sha256: digest(bytes), ...mediaInfo(bytes) }];
        })),
      };
      writeFileSync(join(stage, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
      checkManifest(manifest, stage);
      console.log(`Review every PNG/GIF, then apply with: bun run media:record --apply ${stage}`);
    } else console.log('Single-tape preview only; it cannot be applied as a complete capture.');
  } catch (error) {
    console.error(`Capture stopped. Existing repository media was not replaced. Staging retained: ${stage}`);
    throw error;
  }
}
