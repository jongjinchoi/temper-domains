import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkManifest, MANIFEST, outputPaths, ROOT, tapeSources } from './media/core.ts';
import { manifestForCurrentPackage, recordPackageSource } from './media-package.ts';
import { HELP_COMMANDS, USER_DOCS, validateLinks, validateLicenseLabels } from './documentation.ts';
import { createHash } from 'node:crypto';

if (process.argv[2] === '--record-package') {
  if (process.argv.length > 4) throw new Error('Usage: scripts/docs.ts --record-package [staging-directory]');
  const mediaRoot = process.argv[3] ? resolve(process.argv[3]) : ROOT;
  const path = join(mediaRoot, MANIFEST);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  checkManifest(manifest, mediaRoot);
  const recorded = recordPackageSource(manifest, readFileSync(join(ROOT, 'package.json'), 'utf8'));
  writeFileSync(path, JSON.stringify(recorded, null, 2) + '\n');
  console.log('Preserved the hash-verified package source and omitted machine paths; capture identity and media are unchanged.');
  process.exit(0);
}

const file = join(ROOT, 'docs/cli.md');
const original = readFileSync(file, 'utf8');
const start = '<!-- temper-help:start -->', end = '<!-- temper-help:end -->';
const match = /<!-- temper-help:start -->[\s\S]*?<!-- temper-help:end -->/;
const help = Bun.spawnSync([process.execPath, join(ROOT, 'src/index.ts'), '--help'], {
  cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', COLUMNS: '100', TEMPER_NO_UPDATE_CHECK: '1' },
});
if (help.exitCode !== 0) throw new Error(`CLI help failed: ${help.stderr}`);
const expected = `${start}\n\n\`\`\`text\n$ temper --help\n\n${help.stdout.toString().trimEnd()}\n\`\`\`\n\n${end}`;
if (!match.test(original)) throw new Error('CLI reference help markers are missing');
const registered = [...readFileSync(join(ROOT, 'src/index.ts'), 'utf8').matchAll(/\.command\("([^"]+)"\)/g)].map(m => m[1]);
if (registered.some(name => !HELP_COMMANDS.some(command => command.split(' ').at(-1) === name))) throw new Error('A registered command is missing from documentation help coverage');
const optionBlocks = HELP_COMMANDS.filter(Boolean).map(command => {
  const result = Bun.spawnSync([process.execPath, join(ROOT, 'src/index.ts'), ...command.split(' '), '--help'], {
    cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', COLUMNS: '100', TEMPER_NO_UPDATE_CHECK: '1' },
  });
  if (result.exitCode !== 0) throw new Error(`Help failed for ${command}: ${result.stderr}`);
  return `### temper ${command}\n\n\`\`\`text\n${result.stdout.toString().trimEnd()}\n\`\`\``;
});
const optionsMatch = /<!-- temper-options:start -->[\s\S]*?<!-- temper-options:end -->/;
const optionsExpected = `<!-- temper-options:start -->\n\n${optionBlocks.join('\n\n')}\n\n<!-- temper-options:end -->`;
if (!optionsMatch.test(original)) throw new Error('Command option markers are missing');
if (process.argv.slice(2).join(' ') === '--write-help') {
  writeFileSync(file, original.replace(match, expected).replace(optionsMatch, optionsExpected));
  console.log('Updated the CLI reference from all command help outputs.');
} else {
  if (process.argv.length !== 2) throw new Error('Usage: docs:check or docs:help');
  if (original.match(match)![0] !== expected || original.match(optionsMatch)![0] !== optionsExpected) throw new Error('CLI reference help differs; run bun run docs:help');
  const contracts = Bun.spawnSync([process.execPath, 'test', 'src/update/installation.test.ts'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (contracts.exitCode !== 0) throw new Error(`Installation documentation contracts failed:\n${contracts.stdout}\n${contracts.stderr}`);
  const pages = new Map([...USER_DOCS, 'docs/current.md', 'docs/release.md', 'docs/backlog.md'].map(path => [path, readFileSync(join(ROOT, path), 'utf8')]));
  validateLinks(pages, path => existsSync(join(ROOT, path)));
  const labels = ['README.md', 'web/components/Hero.tsx', 'web/components/Features.tsx', 'web/components/Cta.tsx', 'web/components/Footer.tsx', 'web/app/layout.tsx', 'web/app/llms.txt/route.ts'];
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  validateLicenseLabels(pkg.license, new Map(labels.map(path => [path, readFileSync(join(ROOT, path), 'utf8')])));
  if (JSON.parse(readFileSync(join(ROOT, 'web/package.json'), 'utf8')).license !== pkg.license) throw new Error('Workspace license differs');
  const inventory = JSON.parse(readFileSync(join(ROOT, 'legal/inventory.json'), 'utf8'));
  if (inventory.lockSha256 !== createHash('sha256').update(readFileSync(join(ROOT, 'bun.lock'))).digest('hex')) throw new Error('Dependency license inventory needs review after lockfile changes');
  if (inventory.licenseTextSha256 !== createHash('sha256').update(readFileSync(join(ROOT, 'LICENSE'))).digest('hex')) throw new Error('LICENSE differs from the reviewed standard AGPL text');
  const references = [...[...pages.values()].join('\n').matchAll(/(?:https:\/\/raw\.githubusercontent\.com\/jongjinchoi\/temper-domains\/main\/)?(assets\/[a-zA-Z0-9/_.-]+\.(?:png|gif))/g)].map(m => m[1]!);
  for (const ref of references) if (!existsSync(join(ROOT, ref))) throw new Error(`Missing README media: ${ref}`);
  const tapes = tapeSources();
  if (outputPaths(tapes).length !== 19) throw new Error('Expected 19 capture outputs');
  for (const tape of tapes) {
    if (!tape.includes('Wait+Screen') || !tape.includes('Set FontFamily') || !tape.includes('Require temper-media-session')) throw new Error('Tape lacks recording safeguards');
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
  if (!manifest.runtime.bunExecutable || /[/\\]/.test(manifest.runtime.bunExecutable) || manifest.runtime.entry !== 'src/index.ts') {
    throw new Error('Public capture metadata must omit machine paths; prepare the manifest with --record-package before applying it');
  }
  try {
    checkManifest(manifestForCurrentPackage(manifest, readFileSync(join(ROOT, 'package.json'), 'utf8')));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Capture inputs changed:')) {
      throw new Error('Capture inputs changed: review whether screens or demonstrated interactions changed before deciding to recapture');
    }
    throw error;
  }
  console.log('Command help, installation contracts, documentation links, license labels and original capture fingerprints match. Other prose still requires source review.');
}
