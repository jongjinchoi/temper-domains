import { posix } from 'node:path';

export const USER_DOCS = ['README.md', 'docs/cli.md', 'docs/extensions.md', 'docs/troubleshooting.md', 'docs/mcp.md', 'docs/licensing.md'];
export const HELP_COMMANDS = ['', 'search', 'suggest', 'init', 'history', 'watch', 'whois', 'list', 'extensions', 'config', 'config theme', 'update', 'mcp', 'help'];

function prose(text: string) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
}
function anchors(text: string) {
  const ids = new Set<string>();
  const seen = new Map<string, number>();
  for (const match of prose(text).matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = match[1]!.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    ids.add(count ? `${slug}-${count}` : slug); seen.set(slug, count + 1);
  }
  for (const match of text.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(match[1]!);
  return ids;
}

export function validateLinks(pages: Map<string, string>, exists: (path: string) => boolean) {
  for (const [file, source] of pages) {
    const text = prose(source);
    const refs = [...text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\b(?:href|src)=["']([^"']+)["']/g)].map(m => m[1] ?? m[2]!);
    for (let ref of refs) {
      const repo = 'https://github.com/jongjinchoi/temper-domains/blob/main/';
      const raw = 'https://raw.githubusercontent.com/jongjinchoi/temper-domains/main/';
      let absolute = false;
      if (ref.startsWith(repo) || ref.startsWith(raw)) { ref = ref.slice(ref.startsWith(repo) ? repo.length : raw.length); absolute = true; }
      else if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
      const [path = '', anchor] = ref.split('#');
      const target = path ? posix.normalize(absolute ? path : posix.join(posix.dirname(file), path)) : file;
      if (!exists(target)) throw new Error(`${file}: missing link ${ref} (${target})`);
      if (anchor && target.endsWith('.md') && pages.has(target) && !anchors(pages.get(target)!).has(decodeURIComponent(anchor))) {
        throw new Error(`${file}: missing anchor ${ref}`);
      }
    }
  }
}

// Historical and third-party notices are intentionally outside these current product labels.
export function validateLicenseLabels(license: string, labels: Map<string, string>, required = ['README.md']) {
  if (license !== 'AGPL-3.0-only') throw new Error('Expected the approved AGPL-3.0-only package license');
  for (const [path, source] of labels) {
    if (/Apache(?:[- ]|%20)2(?:\.0|%2E0)/i.test(source)) throw new Error(`Stale product license in ${path}`);
    if (required.includes(path) && !/AGPL(?:-3\.0-only| 3\.0 only)/i.test(source)) throw new Error(`Missing approved license label in ${path}`);
  }
  for (const path of required) if (!labels.has(path)) throw new Error(`Missing approved license label in ${path}`);
}
