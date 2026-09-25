import { execFileSync } from 'node:child_process';

export const SOURCE_REPOSITORY = 'https://github.com/jongjinchoi/temper-domains';

// Hosted builds identify their source through deployment metadata. Their working
// directories also contain files managed by the build platform, not just source.
export function websiteSourceUrl(root) {
  const publicBuild = process.env.TEMPER_PUBLIC_BUILD === '1' || process.env.VERCEL === '1';
  if (!publicBuild) return sourceIdentity(root, { publicBuild: false, expectedRevision: '' }).sourceUrl;
  let revision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (!revision) {
    try {
      revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
      throw new Error('Cannot identify the website source revision; provide the deployment commit SHA');
    }
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid website deployment revision');
  return `${SOURCE_REPOSITORY}/tree/${revision}`;
}

/** @param {string} root
 * @param {{publicBuild?: boolean, expectedRevision?: string, includePath?: (path: string) => boolean}} [options] */
export function sourceIdentity(root, { publicBuild = process.env.TEMPER_PUBLIC_BUILD === '1' || process.env.VERCEL === '1', expectedRevision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA, includePath = () => true } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let revision, status;
  try {
    revision = git('rev-parse', 'HEAD');
    // NUL-separated paths avoid quoting/rename ambiguities and include deletions.
    status = [...git('diff', '--name-only', '--no-renames', '-z', 'HEAD').split('\0'),
      ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')]
      .filter(path => path && includePath(path)).join('\n');
  } catch {
    if (publicBuild) throw new Error('Public builds require an identifiable Git checkout');
    return { revision: null, dirty: true, publicBuild: false, sourceUrl: null };
  }
  const dirty = status !== '';
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid source revision');
  if (publicBuild && expectedRevision && expectedRevision !== revision) throw new Error('Build revision differs from the deployment revision');
  if (publicBuild && dirty) throw new Error(`Public builds require committed source inputs. Changed paths:\n${status}`);
  return { revision, dirty, publicBuild, sourceUrl: dirty ? null : `${SOURCE_REPOSITORY}/tree/${revision}` };
}
