import { expect, test } from 'bun:test';
import { buildInventory } from './inventory.ts';
import { applyReviewEvidence, assignmentHash, routeHash, verificationSummary } from './evidence.ts';
import { CLASSIFICATION_RULES_VERSION } from './taxonomy.ts';
const snapshot = () => buildInventory('COM', '// ===BEGIN ICANN DOMAINS===\ncom\n// ===END ICANN DOMAINS===', '2026-09-20', JSON.stringify({services:[[['com'],['https://a.example/']]]}));
test('a changed source cannot reuse its previous semantic review', () => {
  const data = snapshot(); const entry=data.entries[0]!;
  entry.assignments=[{facet:'purpose',id:'general',reason:'Reviewed',source:'https://registry.example/',evidenceType:'registry-purpose',checkedAt:'2026-09-20'}];
  const evidence={sources:{source:{url:'https://registry.example/',sha256:'b'.repeat(64),capturedAt:'2026-09-20',locator:'purpose',claim:'General websites'}},classifications:{com:{state:'assigned' as const,sources:['source'],sourceHashes:{source:'a'.repeat(64)},rationale:'Reviewed purpose',reviewedAt:'2026-09-20',rulesVersion:CLASSIFICATION_RULES_VERSION,assignmentsHash:assignmentHash(entry)}},lookups:{}};
  expect(()=>applyReviewEvidence(data,evidence)).toThrow(/review/i);
});

test('classification assignments must point to their captured review sources', () => {
  const data = snapshot();
  const entry = data.entries[0]!;
  entry.assignments = [{ facet: 'purpose', id: 'general', reason: 'Reviewed', source: 'https://uncaptured.example/', evidenceType: 'registry-purpose', checkedAt: '2026-09-20' }];
  const evidence = {
    sources: { source: { url: 'https://registry.example/', sha256: 'a'.repeat(64), capturedAt: '2026-09-20', locator: 'purpose', claim: 'General websites' } },
    classifications: { com: { state: 'assigned' as const, sources: ['source'], sourceHashes: { source: 'a'.repeat(64) }, rationale: 'Reviewed purpose', reviewedAt: '2026-09-20', rulesVersion: CLASSIFICATION_RULES_VERSION, assignmentsHash: assignmentHash(entry) } },
    lookups: {},
  };
  expect(() => applyReviewEvidence(data, evidence)).toThrow(/source/i);
});
test('lookup records become stale after a route or checker change, without changing membership',()=>{
 const data=snapshot(); const entry=data.entries[0]!;
 entry.lookupVerification=[{checkedAt:'2026-09-20',routeHash:routeHash('com',data),checkerHash:'a'.repeat(64),runtime:'Bun test',domain:'unused.com',status:'available',attempts:1}];
 expect(verificationSummary(entry,data,'a'.repeat(64)).state).toBe('response-confirmed');
 expect(verificationSummary(entry,data,'b'.repeat(64)).state).toBe('needs-recheck');
 const changed=snapshot();changed.rdapEndpoints!.com=['https://b.example/'];
 expect(verificationSummary(entry,changed,'a'.repeat(64)).state).toBe('needs-recheck');
});

import { checkerSignatures } from '../../scripts/checker-fingerprint.ts';
import { inventory } from './catalog.ts';
test('bundled verification signature corresponds to the current checker and dependencies', async()=>{
  expect(await checkerSignatures()).toEqual(inventory.checkerSignatures!);
});

test('an unattempted lookup cannot be reported as a confirmed response',()=>{
 const data=snapshot();const entry=data.entries[0]!;
 entry.lookupVerification=[{checkedAt:'2026-09-20',routeHash:routeHash('com',data),checkerHash:'a'.repeat(64),runtime:'Bun test',domain:'unused.com',status:'available',attempts:0}];
 expect(verificationSummary(entry,data,'a'.repeat(64)).state).toBe('not-checked');
 expect(verificationSummary(entry,data,'b'.repeat(64)).state).toBe('not-checked');
});
