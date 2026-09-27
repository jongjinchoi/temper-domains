import { expect } from "bun:test";
import type { Admission, LimitPermit } from "../../src/checker/limits.ts";

// Assert one production admission result; no test-only pacing/retry loop.
export async function expectPermit(admission: Promise<Admission>): Promise<LimitPermit> {
  const result = await admission;
  expect(result.permit).toBeDefined();
  return result.permit!;
}
