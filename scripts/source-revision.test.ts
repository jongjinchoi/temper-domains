import { test, expect } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { sourceIdentity } from './source-revision.mjs';

test('source identity rejects uncommitted public inputs and mismatched deployment revisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-source-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    expect(() => sourceIdentity(root, { publicBuild: true })).toThrow('Git checkout');
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(root, 'input'), 'source'); git('add', 'input'); git('commit', '-m', 'fixture');
    const clean = sourceIdentity(root, { publicBuild: true, expectedRevision: '' });
    expect(clean.sourceUrl).toEndWith(`/tree/${clean.revision}`);
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '0'.repeat(40) })).toThrow('differs');
    writeFileSync(join(root, 'input'), 'changed');
    expect(sourceIdentity(root, { publicBuild: false }).sourceUrl).toBeNull();
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '' })).toThrow('committed');
    git('checkout', '--', 'input'); writeFileSync(join(root, 'new-input'), 'new source');
    expect(() => sourceIdentity(root, { publicBuild: true, expectedRevision: '' })).toThrow('committed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('public Next config uses the deployment revision independently of worktree changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'temper-public-web-'));
  const project = resolve(import.meta.dir, '..');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    mkdirSync(join(root, 'web'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    for (const path of ['.gitignore', 'package.json', 'web/next.config.mjs', 'scripts/source-revision.mjs']) {
      copyFileSync(join(project, path), join(root, path));
    }
    writeFileSync(join(root, 'web/page.tsx'), 'export default "original";\n');
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.'); git('commit', '-m', 'fixture');
    const revision = git('rev-parse', 'HEAD');
    const load = (overrides: Record<string, string> = {}) => spawnSync('node', ['--input-type=module', '-e',
      'const {default:config}=await import("./web/next.config.mjs"); console.log(config.env.NEXT_PUBLIC_TEMPER_SOURCE_URL);'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, VERCEL: '1', TEMPER_PUBLIC_BUILD: '0', VERCEL_GIT_COMMIT_SHA: revision, ...overrides },
    });
    for (const directory of ['.vercel', 'web/.vercel']) {
      mkdirSync(join(root, directory, 'output'), { recursive: true });
      writeFileSync(join(root, directory, 'project.json'), '{"projectId":"fixture"}\n');
      writeFileSync(join(root, directory, 'output/config.json'), '{"version":3}\n');
    }
    const generated = load();
    expect(generated.stderr).toBe('');
    expect(generated.status).toBe(0);
    expect(generated.stdout.trim()).toBe(`https://github.com/jongjinchoi/temper-domains/tree/${revision}`);

    writeFileSync(join(root, 'web/page.tsx'), 'export default "changed";\n');
    const changed = load();
    expect(changed.status).toBe(0);
    expect(changed.stdout.trim()).toBe(generated.stdout.trim());
    git('checkout', '--', 'web/page.tsx');
    writeFileSync(join(root, 'web/new-source.ts'), 'export const added = true;\n');
    const untracked = load();
    expect(untracked.status).toBe(0);
    expect(untracked.stdout.trim()).toBe(generated.stdout.trim());
    const ci = load({ VERCEL: '0', TEMPER_PUBLIC_BUILD: '1', VERCEL_GIT_COMMIT_SHA: '', GITHUB_SHA: revision });
    expect(ci.status).toBe(0);
    expect(ci.stdout.trim()).toBe(generated.stdout.trim());
    const checkout = load({ VERCEL_GIT_COMMIT_SHA: '', GITHUB_SHA: '' });
    expect(checkout.status).toBe(0);
    expect(checkout.stdout.trim()).toBe(generated.stdout.trim());
    rmSync(join(root, '.git'), { recursive: true, force: true });
    const withoutGit = load();
    expect(withoutGit.status).toBe(0);
    expect(withoutGit.stdout.trim()).toBe(generated.stdout.trim());
    expect(load({ VERCEL_GIT_COMMIT_SHA: 'not-a-commit' }).stderr).toContain('Invalid website deployment revision');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
