import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkManifest, MANIFEST, outputPaths, ROOT, tapeSources } from './media/core.ts';

const file = join(ROOT, 'README.md');
const original = readFileSync(file, 'utf8');
const start = '<!-- temper-help:start -->', end = '<!-- temper-help:end -->';
const match = /<!-- temper-help:start -->[\s\S]*?<!-- temper-help:end -->/;
const help = Bun.spawnSync([process.execPath, join(ROOT, 'src/index.ts'), '--help'], {
  cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', COLUMNS: '100', TEMPER_NO_UPDATE_CHECK: '1' },
});
if (help.exitCode !== 0) throw new Error(`CLI help failed: ${help.stderr}`);
const expected = `${start}\n\n\`\`\`text\n$ temper --help\n\n${help.stdout.toString().trimEnd()}\n\`\`\`\n\n${end}`;
if (!match.test(original)) throw new Error('README help markers are missing');
if (process.argv.slice(2).join(' ') === '--write-help') {
  writeFileSync(file, original.replace(match, expected));
  console.log('Updated the README help block from the current CLI.');
} else {
  if (process.argv.length !== 2) throw new Error('Usage: docs:check or docs:help');
  if (original.match(match)![0] !== expected) throw new Error('README help differs; run bun run docs:help');
  const references = [...original.matchAll(/(?:https:\/\/raw\.githubusercontent\.com\/jongjinchoi\/temper-domains\/main\/)?(assets\/[a-zA-Z0-9/_.-]+\.(?:png|gif))/g)].map(m => m[1]!);
  for (const ref of references) if (!existsSync(join(ROOT, ref))) throw new Error(`Missing README media: ${ref}`);
  const tapes = tapeSources();
  if (outputPaths(tapes).length !== 19) throw new Error('Expected 19 capture outputs');
  for (const tape of tapes) {
    if (!tape.includes('Wait+Screen') || !tape.includes('Set FontFamily') || !tape.includes('Require temper-media-session')) throw new Error('Tape lacks recording safeguards');
  }
  checkManifest(JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8')));
  console.log('README help, media references, tape outputs and capture fingerprints match.');
}
