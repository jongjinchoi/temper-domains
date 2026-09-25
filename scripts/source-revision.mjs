import { execFileSync } from 'node:child_process';

export const SOURCE_REPOSITORY = 'https://github.com/jongjinchoi/temper-domains';

export function sourceIdentity(root, { publicBuild = process.env.TEMPER_PUBLIC_BUILD === '1' || process.env.VERCEL === '1', expectedRevision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let revision, dirty;
  try {
    revision = git('rev-parse', 'HEAD');
    dirty = git('status', '--porcelain', '--untracked-files=all') !== '';
  } catch {
    if (publicBuild) throw new Error('Public builds require an identifiable Git checkout');
    return { revision: null, dirty: true, publicBuild: false, sourceUrl: null };
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid source revision');
  if (publicBuild && expectedRevision && expectedRevision !== revision) throw new Error('Build revision differs from the deployment revision');
  if (publicBuild && dirty) throw new Error('Public builds require committed source inputs');
  return { revision, dirty, publicBuild, sourceUrl: dirty ? null : `${SOURCE_REPOSITORY}/tree/${revision}` };
}
