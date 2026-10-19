import type { CheckSummary } from "../../../../src/checker/types.ts";
import { checkDomains } from "../../../server/checker";
import { DEMO_FIRST_TLDS, HERO_DEMO_NAME } from "../../../lib/temper-data";

export const runtime = "nodejs";
// ISR: the hero example is generated at build time and then at most once per
// 30 minutes, so page views do not trigger registry lookups.
export const revalidate = 1800;

export async function GET() {
  const start = performance.now();
  const checkedAt = new Date().toISOString();
  const rows: unknown[] = [];
  let summary: CheckSummary | undefined;
  try {
    for await (const row of checkDomains(HERO_DEMO_NAME, DEMO_FIRST_TLDS, {
      concurrency: DEMO_FIRST_TLDS.length,
      timeoutMs: 3000,
      onSummary: value => { summary = value; },
    })) {
      rows.push(row);
    }
  } catch (err) {
    // Keep a 200 response so a failed lookup never fails the build; the hero
    // reports the example as unavailable.
    return Response.json({ name: HERO_DEMO_NAME, checkedAt, rows: [], error: err instanceof Error ? err.message : String(err) });
  }
  return Response.json({ name: HERO_DEMO_NAME, checkedAt, rows, summary, elapsed: Math.round(performance.now() - start) });
}
