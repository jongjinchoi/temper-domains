import { lookupRoute, normalizeSuffix } from './boundary.ts';
import { hash } from './inventory.ts';
import { INDUSTRIES, PURPOSES } from './taxonomy.ts';
import type { Inventory } from './types.ts';

export interface RuntimeCatalogSnapshot {
  catalogVersion: string;
  inventory: Inventory;
}

export function supportedCatalogEntries(inventory: Inventory) {
  return inventory.entries.filter(entry => {
    if (!entry.offers?.length || lookupRoute(entry.suffix, inventory) === 'unsupported') return false;
    try { return normalizeSuffix(entry.suffix, inventory) === entry.suffix; } catch { return false; }
  }).sort((a, b) => a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0);
}

// Preserve the full-snapshot identity used by existing discovery cursors.
export function projectRuntimeCatalog(full: Inventory): RuntimeCatalogSnapshot {
  const catalogVersion = hash(JSON.stringify(full) + JSON.stringify([INDUSTRIES, PURPOSES]) + JSON.stringify(full.entries.map(entry => lookupRoute(entry.suffix, full)))).slice(0, 16);
  const supported = new Set(supportedCatalogEntries(full).map(entry => entry.suffix));
  return {
    catalogVersion,
    inventory: { ...full, entries: full.entries.filter(entry => supported.has(entry.suffix) || entry.namespace) },
  };
}
