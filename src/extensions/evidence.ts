import { hash } from './inventory.ts';
import { catalogLookupPlan } from './boundary.ts';
import type { ExtensionEntry, Inventory, ReviewEvidence } from './types.ts';
import { CLASSIFICATION_RULES_VERSION } from './taxonomy.ts';

export const assignmentHash = (entry: ExtensionEntry) => hash(JSON.stringify(entry.assignments.filter(a => a.facet !== 'region')));
export const routeHash = (suffix: string, inventory: Inventory) => hash(JSON.stringify(catalogLookupPlan(suffix, inventory)));
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function applyReviewEvidence(inventory: Inventory, evidence: ReviewEvidence): void {
  for (const [id, source] of Object.entries(evidence.sources)) {
    if (!id || !/^https?:\/\//.test(source.url) || !date(source.capturedAt) || !digest(source.sha256) || !source.claim || !source.locator) throw new Error(`Invalid captured review source: ${id}`);
  }
  inventory.reviewSources = evidence.sources;
  for (const entry of inventory.entries) {
    const review = evidence.classifications[entry.suffix];
    if (review) {
      if (!['assigned','deferred','unreviewed'].includes(review.state) || !review.rationale || !Array.isArray(review.sources) || review.sources.some(id => !evidence.sources[id])) throw new Error(`Invalid review: ${entry.suffix}`);
      if (review.state !== 'unreviewed' && (!date(review.reviewedAt) || !review.sources.length)) throw new Error(`Missing review evidence: ${entry.suffix}`);
      const stale = review.sources.some(id => review.sourceHashes?.[id] !== evidence.sources[id]?.sha256) || review.rulesVersion !== CLASSIFICATION_RULES_VERSION || review.assignmentsHash !== assignmentHash(entry);
      const classified = entry.assignments.some(a => a.facet !== 'region');
      const sourceUrls = new Set(review.sources.map(id => evidence.sources[id]!.url));
      if (entry.assignments.some(a => a.facet !== 'region' && !sourceUrls.has(a.source))) throw new Error(`Classification source was not captured for review: ${entry.suffix}`);
      if (classified && (stale || review.state !== 'assigned')) throw new Error(`Classification needs review: ${entry.suffix}`);
      if (!classified && review.state === 'assigned') throw new Error(`Assigned review has no classifications: ${entry.suffix}`);
      entry.classificationReview = stale ? { ...review, state: 'unreviewed' } : review;
    } else if (entry.assignments.some(a => a.facet !== 'region')) throw new Error(`Missing classification review: ${entry.suffix}`);
    const records = evidence.lookups[entry.suffix];
    if (records) {
      for (const record of records) {
        if (!date(record.checkedAt) || !digest(record.routeHash) || !digest(record.checkerHash) || !record.runtime || !record.domain.endsWith(`.${entry.suffix}`) || !Number.isInteger(record.attempts) || record.attempts < 0 || !['available','taken','reserved','premium','rate_limited','slow','error'].includes(record.status)) throw new Error(`Invalid lookup evidence: ${entry.suffix}`);
      }
      entry.lookupVerification = records;
    }
  }
}
export function verificationSummary(entry: ExtensionEntry, inventory: Inventory, checkerHash: string) {
  const records = entry.lookupVerification ?? [];
  const current = records.filter(r => r.routeHash === routeHash(entry.suffix, inventory) && r.checkerHash === checkerHash);
  const latest = current.toSorted((a,b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
  return { state: latest ? latest.attempts === 0 ? 'not-checked' : ['available','taken','reserved','premium'].includes(latest.status) ? 'response-confirmed' : 'observed-error' : records.some(r => r.attempts > 0) ? 'needs-recheck' : 'not-checked', latest: latest ?? records.toSorted((a,b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0] ?? null,
    note: 'An observed response is not a purchase guarantee or a prediction of current server availability.' };
}
