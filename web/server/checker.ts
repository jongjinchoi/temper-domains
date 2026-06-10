// Node-runtime port of src/checker/checker.ts — the CLI version calls
// getBootstrap() from a file-system cache, which breaks on serverless. This
// version uses the in-memory bootstrap in web/server/bootstrap.ts and accepts
// an external AbortSignal so the API route can forward browser cancellation.

import { lookupDomainAvailability } from "../../src/checker/lookup.ts";
import { streamDomainResults } from "../../src/checker/stream.ts";
import type { DomainResult } from "../../src/checker/types.ts";
import { getTld } from "../../src/utils/domain.ts";
import { sanitizeDomain } from "../../src/utils/validate.ts";
import { getBootstrap, getRdapUrl } from "./bootstrap.ts";

export interface CheckOptions {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function* checkDomains(
  name: string,
  tlds: readonly string[],
  options: CheckOptions = {},
): AsyncGenerator<DomainResult> {
  const checkOptions: CheckOptions = { concurrency: 15, timeoutMs: 3000, ...options };
  const { timeoutMs = 3000 } = checkOptions;

  const bootstrap = await getBootstrap();

  const safeName = sanitizeDomain(name);
  const domains = tlds.map((tld) => `${safeName}.${tld}`);
  yield* streamDomainResults(domains, checkOptions, async (domain, signal) => {
    const tld = getTld(domain);
    const rdapUrl = getRdapUrl(bootstrap, tld);
    return lookupDomainAvailability(domain, rdapUrl, signal, timeoutMs);
  });
}
