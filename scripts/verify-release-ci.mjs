import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function github(path) {
  const token = process.env.GH_TOKEN;
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${path}`);
  return response.json();
}

// Read every page; never turn a truncated or malformed response into approval.
async function list(request, path, key) {
  const entries = [];
  const ids = new Set();
  let total;
  for (let page = 1; ; page++) {
    const data = await request(`${path}&per_page=100&page=${page}`);
    if (!Number.isSafeInteger(data.total_count) || data.total_count < 0 || data.total_count > 1000
      || (total !== undefined && total !== data.total_count) || !Array.isArray(data[key])) {
      throw new Error('CI list is invalid or changed; inspect the workflow and retry');
    }
    total = data.total_count;
    for (const entry of data[key]) {
      if (!Number.isSafeInteger(entry?.id) || entry.id <= 0 || ids.has(entry.id)) throw new Error('CI list contains invalid or duplicate entries');
      ids.add(entry.id);
      entries.push(entry);
    }
    if (entries.length === total) return entries;
    if (entries.length > total || data[key].length === 0) throw new Error('CI list is incomplete');
  }
}

export async function verifyReleaseCi({ repository, sha, request = github }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
    throw new Error('Supply the release repository and full commit SHA');
  }
  const base = `repos/${repository}/actions`;
  const workflow = await request(`${base}/workflows/ci.yml`);
  if (!Number.isSafeInteger(workflow.id) || workflow.id <= 0 || workflow.path !== '.github/workflows/ci.yml' || workflow.state !== 'active') {
    throw new Error('CI workflow is missing, inactive or unexpected');
  }
  const identity = run => {
    if (run?.workflow_id !== workflow.id || run.path !== workflow.path || run.head_sha !== sha
      || run.event !== 'push' || run.head_branch !== 'main'
      || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
      || !Number.isSafeInteger(run.repository?.id) || run.repository.id <= 0 || run.repository.id !== run.head_repository?.id
      || !Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_number) || run.run_number <= 0
      || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) {
      throw new Error(`CI identity does not match ${repository}@${sha}`);
    }
  };
  const runs = await list(request, `${base}/workflows/${workflow.id}/runs?head_sha=${sha}&event=push&branch=main`, 'workflow_runs');
  if (!runs.length) throw new Error(`No main CI evidence for ${sha}; complete CI for this exact commit first`);
  runs.forEach(identity);
  const selected = runs.reduce((a, b) => a.run_number > b.run_number ? a : b);
  const runPath = `${base}/runs/${selected.id}`;
  const url = `https://github.com/${repository}/actions/runs/${selected.id}`;
  const run = await request(runPath);
  identity(run);
  if (run.id !== selected.id || run.run_number !== selected.run_number || run.run_attempt !== selected.run_attempt) {
    throw new Error(`CI changed while reading evidence: ${url}; retry after CI finishes`);
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error(`CI is not successful for ${sha}: ${url} attempt ${run.run_attempt} (${run.status}/${run.conclusion}); complete CI before retrying Release`);
  }
  const jobs = await list(request, `${runPath}/jobs?filter=latest`, 'jobs');
  const required = jobs.filter(job => job.name === 'CI / required');
  if (required.length !== 1 || required[0].head_sha !== sha || required[0].run_attempt !== run.run_attempt
    || required[0].status !== 'completed' || required[0].conclusion !== 'success') {
    throw new Error(`CI / required must succeed in the current attempt: ${url}`);
  }
  const final = await request(runPath);
  identity(final);
  if (final.id !== run.id || final.run_number !== run.run_number || final.run_attempt !== run.run_attempt
    || final.status !== run.status || final.conclusion !== run.conclusion) {
    throw new Error(`CI changed while reading evidence: ${url}; retry after CI finishes`);
  }
  return { sha, runId: run.id, attempt: run.run_attempt, url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const sha = process.env.GITHUB_SHA;
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== sha) throw new Error('Checkout HEAD differs from the release execution SHA');
    const evidence = await verifyReleaseCi({ repository: process.env.GITHUB_REPOSITORY, sha });
    const message = `CI approved ${evidence.sha}: ${evidence.url} (attempt ${evidence.attempt})`;
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  } catch (error) {
    console.error(`Release blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
