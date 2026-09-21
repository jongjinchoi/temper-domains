import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from '../src/extensions/inventory.ts';
import { applyReviewEvidence } from '../src/extensions/evidence.ts';
import type { Inventory } from '../src/extensions/types.ts';
export async function checkerFingerprint(method?: "rdap" | "whois"): Promise<string> {
  const root = resolve(import.meta.dir, '..');
  let files = (await readdir(resolve(root, 'src/checker'))).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => `src/checker/${name}`);
  if (method === "rdap") files = files.filter(name => !name.endsWith("/whois.ts"));
  if (method === "whois") files = files.filter(name => !name.endsWith("/rdap.ts") && !name.endsWith("/http-transport.ts"));
  files.push('src/utils/domain.ts', 'src/utils/validate.ts', 'bun.lock');
  return hash((await Promise.all(files.sort().map(async name => `${name}\n${await readFile(resolve(root, name), 'utf8')}`))).join('\n'));
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
