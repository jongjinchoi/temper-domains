import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from '../src/extensions/inventory.ts';
import { applyReviewEvidence } from '../src/extensions/evidence.ts';
import type { Inventory } from '../src/extensions/types.ts';
type Lock = { workspaces: Record<string, { dependencies?: Record<string, string> }>; packages: Record<string, [string, string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }, ...unknown[]]>; patchedDependencies?: Record<string, string> };

export function checkerDependencyInputs(sources: string[], lock: Lock) {
  const names = [...new Set(sources.flatMap(source => [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'".][^'"]*)['"]/g)]
    .map(match => match[1]!).filter(name => !name.startsWith('node:') && !name.startsWith('bun:'))
    .map(name => name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]!)))].sort();
  const selected: Record<string, unknown> = {};
  const visit = (name: string, parent = '') => {
    const candidates = parent ? [`${parent}/${name}`, name] : [name];
    const key = candidates.find(candidate => lock.packages[candidate]);
    if (!key) throw new Error(`Checker dependency is absent from lockfile: ${name}`);
    if (key in selected) return;
    const entry = lock.packages[key]!;
    selected[key] = { entry, patch: lock.patchedDependencies?.[entry[0]] ?? null };
    for (const dependency of Object.keys({ ...entry[2].dependencies, ...entry[2].optionalDependencies, ...entry[2].peerDependencies }).sort()) visit(dependency, key);
  };
  names.forEach(name => visit(name));
  return { direct: Object.fromEntries(names.map(name => [name, lock.workspaces['']?.dependencies?.[name] ?? null])),
    packages: Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b))) };
}

export async function scopedCheckerFingerprint(method?: "rdap" | "whois", root = resolve(import.meta.dir, '..')): Promise<string> {
  let files = (await readdir(resolve(root, 'src/checker'))).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => `src/checker/${name}`);
  if (method === "rdap") files = files.filter(name => !name.endsWith("/whois.ts"));
  if (method === "whois") files = files.filter(name => !name.endsWith("/rdap.ts") && !name.endsWith("/http-transport.ts"));
  files.push('src/utils/domain.ts', 'src/utils/validate.ts');
  const sources = await Promise.all(files.sort().map(async name => `${name}\n${await readFile(resolve(root, name), 'utf8')}`));
  const lock = Bun.JSONC.parse(await readFile(resolve(root, 'bun.lock'), 'utf8')) as Lock;
  const dependencies = checkerDependencyInputs(sources, lock);
  return hash([...sources, JSON.stringify(dependencies), await readFile(resolve(root, 'tsconfig.json'), 'utf8')].join('\n'));
}

export async function checkerFingerprint(method?: 'rdap' | 'whois'): Promise<string> {
  const fingerprint = await scopedCheckerFingerprint(method);
  // Migration from the whole-lock algorithm at 820f35f. Both algorithms were
  // computed over the same unchanged checker source and resolved dependencies.
  // Preserve existing evidence IDs/dates; only these exact scoped inputs alias
  // the old IDs. Any checker/dependency/config change produces a new identity.
  const legacy: Record<string, string> = {
    f8c512a9bd633c76f4c58ee82906146170c99c4aff8af5bc25c2dc779c8cc6f3: '94fa5f13078b5866676a7a12f63ff458f611a5bb076d955f6c5f02113407ff41',
    '22bfbd94e765c41b8c4edb2cd663729e2cb07dd228f3892b0f6aedf03acc0a55': '7b370cc68c34aa714a1ba9b9a3b67a2834527cef89a65a10eebdb550f6eac234',
  };
  return legacy[fingerprint] ?? fingerprint;
}

export async function checkerSignatures() {
  const [rdap, whois] = await Promise.all([checkerFingerprint("rdap"), checkerFingerprint("whois")]);
  return { rdap, whois };
}

export async function verifyBundledCheckerSignatures() {
  const catalog = JSON.parse(await readFile(resolve(import.meta.dir, '../src/extensions/data/catalog.json'), 'utf8')) as Inventory;
  if (JSON.stringify(await checkerSignatures()) !== JSON.stringify(catalog.checkerSignatures)) {
    throw new Error('Checker sources changed. Preview and refresh the catalog verification metadata before building; old lookup evidence must not be labeled current.');
  }
  applyReviewEvidence(catalog, {
    sources: catalog.reviewSources ?? {},
    classifications: Object.fromEntries(catalog.entries.flatMap(entry => entry.classificationReview ? [[entry.suffix, entry.classificationReview]] : [])),
    lookups: Object.fromEntries(catalog.entries.flatMap(entry => entry.lookupVerification ? [[entry.suffix, entry.lookupVerification]] : [])),
  });
}
if (import.meta.main) await verifyBundledCheckerSignatures();
