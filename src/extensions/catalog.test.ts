import { expect, test } from "bun:test";
import { buildInventory } from "./inventory.ts";
import { browseExtensions, listCategories, categoryOverview } from "./catalog.ts";
import { normalizeSuffixSelection, resolveExplicitSelection, resolveCategorySelection, assertCandidateLimit } from "./selection.ts";

test("inventory preserves ICANN patterns and exceptions without selling PRIVATE namespaces", () => {
  const data = buildInventory("# Version 1\nCOM\nUK\nCK\nDE\n", `// ===BEGIN ICANN DOMAINS===\ncom\nuk\nco.uk\nde\n*.ck\n!www.ck\n// ===END ICANN DOMAINS===\n// ===BEGIN PRIVATE DOMAINS===\nblogspot.com\n// ===END PRIVATE DOMAINS===`, "2026-09-21T00:00:00Z");
  expect(data.entries.map(e => e.suffix)).toEqual(["ck", "co.uk", "com", "de", "uk"]);
  expect(data.rules).toContain("*.ck");
  expect(data.rules).toContain("!www.ck");
  expect(data.entries.find(e => e.suffix === "co.uk")?.boundaryState).toBe("direct");
  expect(data.entries.find(e => e.suffix === "ck")?.boundaryState).toBe("unknown");
  expect(() => buildInventory("", "", "2026-09-21T00:00:00Z")).toThrow();
  expect(() => buildInventory("COM\nCOM", "bad", "2026-09-21T00:00:00Z")).toThrow();
});

test("navigation separates facets and uses counted, evidence-backed memberships", () => {
  expect(categoryOverview().facets.map(f => f.id)).toEqual(["industry", "purpose", "region"]);
  const design = browseExtensions({ industries: ["design-arts"] });
  expect(design.items.map(e => e.suffix)).toContain("design");
  expect(design.items.every(e => e.assignments.some(a => a.facet === "industry" && a.id === "design-arts" && a.reason && a.source && a.checkedAt))).toBe(true);
  expect(listCategories("industry").categories.find(c => c.id === "design-arts")?.count).toBe(design.matched);
  expect(browseExtensions({ regions: ["GB"], purposes: ["company"] }).items.map(e => e.suffix)).toContain("co.uk");
  expect(browseExtensions({ industries: ["design-arts"], regions: ["GB"] }).matched).toBe(0);
  expect(() => browseExtensions({ industries: ["typo"] })).toThrow(/Unknown/);
});

test("catalog paging is exhaustive, bounded and bound to the filters and data version", () => {
  const first = browseExtensions({ limit: 2 });
  const next = browseExtensions({ limit: 2, cursor: first.nextCursor! });
  expect(first.items).toHaveLength(2);
  expect(next.items.some(e => first.items.some(f => e.suffix === f.suffix))).toBe(false);
  expect(() => browseExtensions({ query: "co.uk", cursor: first.nextCursor! })).toThrow(/cursor/i);
  expect(() => browseExtensions({ limit: 101 })).toThrow();
  expect(() => browseExtensions({ cursor: "garbage" })).toThrow();
  const stale = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
  stale.key = "prior-version";
  expect(() => browseExtensions({ cursor: Buffer.from(JSON.stringify(stale)).toString("base64url") })).toThrow(/stale/);
});

test("all 756 offered and supported extensions are discoverable and selectable without eligibility gating", () => {
  const suffixes: string[] = [];
  let cursor: string | undefined;
  const sizes: number[] = [];
  do {
    const page = browseExtensions({ limit: 100, cursor });
    expect(page.total).toBe(756);
    expect(page.matched).toBe(756);
    sizes.push(page.items.length);
    for (const entry of page.items) {
      expect(entry).not.toHaveProperty("eligibility");
      expect(entry).not.toHaveProperty("operationalRequirements");
      expect(resolveExplicitSelection([entry.suffix])).toEqual([entry.suffix]);
      suffixes.push(entry.suffix);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(sizes).toEqual([100, 100, 100, 100, 100, 100, 100, 56]);
  expect(new Set(suffixes).size).toBe(756);
  expect(suffixes).toEqual([...suffixes].sort());
  expect(suffixes).toContain("co.uk");
  expect(suffixes).toContain("bank");
  expect(resolveCategorySelection({ industries: ["finance-insurance"] })).toContain("bank");
  expect(resolveExplicitSelection(["software", "biz", "asia", "bank"])).toEqual(["software", "biz", "asia", "bank"]);
  expect(browseExtensions({ query: "google" }).items).toEqual([]);
});

test("selection supports out-of-bundle, IDN and composite suffixes without accepting domains or hosting", () => {
  expect(normalizeSuffixSelection([" .CO.UK ", "design", "co.uk", "uk", "рф", "photography"])).toEqual(["co.uk", "design", "uk", "xn--p1ai", "photography"]);
  expect(normalizeSuffixSelection(["b.ck"])).toEqual(["b.ck"]);
  expect(() => resolveExplicitSelection(["b.ck"])).toThrow(/route/);
  for (const raw of [[], [""], ["com", ""], ["com."], ["..com"], ["https://co.uk"], ["mybrand.com"], ["blogspot.com"], ["www.ck"], ["no-such-extension"], ["arpa"]]) {
    expect(() => resolveExplicitSelection(raw)).toThrow();
  }
  expect(resolveCategorySelection({ industries: ["design-arts"] })).toContain("design");
  expect(() => resolveCategorySelection({ industries: ["design-arts"], regions: ["GB"] })).toThrow(/No/);
  expect(() => assertCandidateLimit(8, 59)).not.toThrow();
  expect(() => assertCandidateLimit(8, 60)).toThrow(/480.*472/);
});

test("supported offerings have dated sources; raw-only suffixes stay out of discovery", () => {
  const first = browseExtensions();
  expect(first.items).toHaveLength(50);
  expect(first.items.every(e => e.offers?.every(o => o.provider && o.source.startsWith("https://") && o.checkedAt))).toBe(true);
  const direct = resolveExplicitSelection(["ac.me"]);
  expect(direct).toEqual(["ac.me"]);
  expect(browseExtensions({ query: "ac.me" }).matched).toBe(0);
  expect(() => assertCandidateLimit(1, 472)).not.toThrow();
  expect(() => assertCandidateLimit(1, 473)).toThrow(/473.*472/);
  expect(() => resolveExplicitSelection(["us"])).toThrow(/route/);
});
