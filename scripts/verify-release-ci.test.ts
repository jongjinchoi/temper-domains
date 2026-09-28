import { expect, test } from 'bun:test';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyReleaseCi } from './verify-release-ci.mjs';

const repository = 'owner/temper';
const sha = 'a'.repeat(40);
const workflow = { id: 7, path: '.github/workflows/ci.yml', state: 'active' };
const run = { id: 42, workflow_id: 7, run_number: 9, run_attempt: 1,
  path: workflow.path, event: 'push', head_branch: 'main', head_sha: sha,
  repository: { id: 23, full_name: repository }, head_repository: { id: 23, full_name: repository },
  status: 'completed', conclusion: 'success' };
const required = { id: 900, name: 'CI / required', head_sha: sha, run_attempt: 1, status: 'completed', conclusion: 'success' };

function fixture({ runs = [run], jobs = [required], current = runs[0], workflowData = workflow,
  override = (_path: string): any => undefined }: { runs?: any[]; jobs?: any[]; current?: any; workflowData?: any; override?: (path: string) => any } = {}) {
  const requests: string[] = [];
  const request = async (path: string): Promise<any> => {
    requests.push(path);
    const replaced = override(path);
    if (replaced !== undefined) return replaced;
    if (path.endsWith('/workflows/ci.yml')) return workflowData;
    if (path.includes('/workflows/7/runs?')) {
      const query = new URLSearchParams(path.split('?')[1]);
      expect(query.get('head_sha')).toBe(sha);
      expect(query.get('event')).toBe('push');
      expect(query.get('branch')).toBe('main');
      expect(query.has('status')).toBe(false);
      return { total_count: runs.length, workflow_runs: runs };
    }
    if (path.includes('/jobs?')) return { total_count: jobs.length, jobs };
    if (path === `repos/${repository}/actions/runs/${current?.id}`) return current;
    throw new Error(`Unexpected API request: ${path}`);
  };
  return { request, requests };
}

test('accepts exact main CI evidence and identifies the approving run and attempt', async () => {
  const { request } = fixture();
  expect(await verifyReleaseCi({ repository, sha, request })).toEqual({
    sha, runId: 42, attempt: 1, url: 'https://github.com/owner/temper/actions/runs/42',
  });
});

test.each([
  { head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { head_branch: 'feature' },
  { workflow_id: 8 }, { path: '.github/workflows/other.yml' },
  { repository: { id: 24, full_name: 'other/repo' } },
  { head_repository: { id: 24, full_name: repository } },
])('rejects CI from the wrong source: %j', async changes => {
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ runs: [{ ...run, ...changes }] }) })).rejects.toThrow('CI identity');
});

test.each(['failure', 'cancelled', 'skipped', 'neutral', 'timed_out', null])('rejects latest CI conclusion %s despite older success', async conclusion => {
  const latest = { ...run, id: 43, run_number: 10, conclusion };
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ runs: [run, latest], current: latest }) })).rejects.toThrow('CI is not successful');
});

test('rejects a running attempt, missing evidence and wrong workflow metadata', async () => {
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ current: { ...run, status: 'in_progress' } }) })).rejects.toThrow('CI is not successful');
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ runs: [] }) })).rejects.toThrow('No main CI');
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ workflowData: { ...workflow, path: 'other.yml' } }) })).rejects.toThrow('CI workflow');
});

test.each([
  [], [{ ...required, conclusion: 'failure' }], [{ ...required, conclusion: 'skipped' }],
  [{ ...required, head_sha: 'b'.repeat(40) }], [{ ...required, run_attempt: 0 }],
  [{ ...required, status: 'in_progress' }], [required, { ...required, id: 901 }],
].map(jobs => ({ jobs })))('requires one successful aggregate from the current SHA and attempt: %j', async ({ jobs }) => {
  await expect(verifyReleaseCi({ repository, sha, ...fixture({ jobs }) })).rejects.toThrow('CI / required');
});

test('reads further pages rather than accepting the first page alone', async () => {
  const latest = { ...run, id: 43, run_number: 10, conclusion: 'failure' };
  const { request, requests } = fixture({ current: latest, override: path => {
    if (path.includes('/workflows/7/runs?')) return { total_count: 2, workflow_runs: path.includes('page=2') ? [latest] : [run] };
  } });
  await expect(verifyReleaseCi({ repository, sha, request })).rejects.toThrow('CI is not successful');
  expect(requests.some(path => path.endsWith('&page=2'))).toBe(true);
});

test('rejects an attempt changing while collecting evidence', async () => {
  let reads = 0;
  const { request } = fixture({ override: path => {
    if (path.endsWith('/runs/42')) return { ...run, run_attempt: ++reads };
  } });
  await expect(verifyReleaseCi({ repository, sha, request })).rejects.toThrow('CI changed');
});

test('API failures and incomplete or malformed pages never authorize publication', async () => {
  await expect(verifyReleaseCi({ repository, sha, request: async () => { throw new Error('GitHub HTTP 403'); } })).rejects.toThrow('403');
  for (const page of [{}, { total_count: 2, workflow_runs: [] }, { total_count: 1001, workflow_runs: [run] }, { total_count: 2, workflow_runs: [run, run] }]) {
    const { request } = fixture({ override: path => path.includes('/runs?') ? page : undefined });
    await expect(verifyReleaseCi({ repository, sha, request })).rejects.toThrow('CI list');
  }
});

test('publication requires CI evidence in verify before packaging, without rerunning CI', () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as any;
  expect(workflow.jobs.quality).toBeUndefined();
  expect(workflow.jobs.verify.permissions).toEqual({ contents: 'read', actions: 'read' });
  const steps = workflow.jobs.verify.steps;
  const gate = steps.findIndex((step: any) => step.run === 'node scripts/verify-release-ci.mjs');
  const pack = steps.findIndex((step: any) => step.run?.includes('npm pack'));
  expect(gate).toBeGreaterThan(-1);
  expect(pack).toBeGreaterThan(gate);
  expect(steps[gate].env.GH_TOKEN).toBe('${{ github.token }}');
  expect(workflow.jobs.source.needs).toEqual(['verify']);
  expect(workflow.jobs.npm.needs).toBe('source');
  expect(workflow.jobs.build.needs).toBe('source');
  expect(workflow.jobs.release.needs).toBe('build');
  expect(workflow.jobs.homebrew.needs).toBe('release');
});

test('tag publication requires the exact commit while npm recovery validates its actual main commit', () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as any;
  const validate = workflow.jobs.verify.steps.find((step: any) => step.name === 'Validate release source').run;
  const root = mkdtempSync(join(tmpdir(), 'temper-release-source-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const check = (event: string, sha: string) => spawnSync('bash', ['-c', validate], { cwd: root,
    env: { ...process.env, RELEASE_TAG: 'v0.0.1', GITHUB_SHA: sha, GITHUB_EVENT_NAME: event,
      GITHUB_REF: event === 'push' ? 'refs/tags/v0.0.1' : 'refs/heads/main' }, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(root, 'package.json'), '{"version":"0.0.1"}');
    const tagged = commit(); git('tag', 'v0.0.1');
    expect(check('push', tagged).status).toBe(0);
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/release.md'), 'Recovery documentation');
    const recovery = commit();
    expect(check('push', recovery).status).not.toBe(0);
    expect(check('workflow_dispatch', recovery).status).toBe(0);
    expect(check('workflow_dispatch', tagged).status).not.toBe(0);
    writeFileSync(join(root, 'unapproved.txt'), 'Outside recovery allowlist');
    expect(check('workflow_dispatch', commit()).status).not.toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
