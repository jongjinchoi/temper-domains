import { checkDomainBatch } from "../../src/checker/batch.ts";
import type { CheckOptions } from "../../src/checker/stream.ts";
import { isValidDomainLabel, sanitizeDomain } from "../../src/utils/validate.ts";
import { getBootstrap } from "./bootstrap.ts";
export type { CheckOptions } from "../../src/checker/stream.ts";

export async function* checkDomains(name: string, tlds: readonly string[], options: CheckOptions = {}) {
  const safeName = sanitizeDomain(name).toLowerCase();
  if (!isValidDomainLabel(safeName)) throw new Error("Invalid domain label");
  yield* checkDomainBatch(tlds.map(tld => `${safeName}.${tld}`), { concurrency: 15, timeoutMs: 3000, ...options }, getBootstrap);
}
