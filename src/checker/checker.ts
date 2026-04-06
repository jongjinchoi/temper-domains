import { getBootstrap, getRdapUrl } from "./bootstrap";
import { pLimit } from "./limiter";
import { rdapLookup } from "./rdap";
import type { DomainResult } from "./types";
import { DEFAULT_TLDS } from "./types";
import { whoisLookup } from "./whois";

export async function* checkDomains(
  name: string,
  tlds: readonly string[] = DEFAULT_TLDS,
  options: { concurrency?: number; timeoutMs?: number } = {},
): AsyncGenerator<DomainResult> {
  const { concurrency = 20, timeoutMs = 3000 } = options;
  const limit = pLimit(concurrency);
  const controller = new AbortController();
  const { signal } = controller;

  // Pre-load bootstrap (cached after first call)
  await getBootstrap();

  const domains = tlds.map((tld) => `${name}.${tld}`);
  const results: DomainResult[] = [];
  let resolveNext: (() => void) | null = null;
  let settled = 0;

  // Launch all checks in parallel with concurrency limit
  const allDone = Promise.allSettled(
    domains.map((domain) =>
      limit(async () => {
        const tld = domain.split(".").pop()!;
        const rdapUrl = getRdapUrl(tld);
        let result: DomainResult;

        try {
          result = rdapUrl
            ? await rdapLookup(domain, rdapUrl, signal)
            : await whoisLookup(domain, signal);
        } catch (err) {
          result = {
            domain,
            tld,
            status: signal.aborted ? "slow" : "error",
            method: rdapUrl ? "rdap" : "whois",
            responseTime: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }

        results.push(result);
        settled++;
        resolveNext?.();
        return result;
      }),
    ),
  );

  // Global timeout
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Yield results as they arrive
  let yielded = 0;
  while (yielded < domains.length) {
    if (yielded < results.length) {
      yield results[yielded++];
    } else {
      await new Promise<void>((r) => {
        resolveNext = r;
      });
    }
  }

  clearTimeout(timeout);
  await allDone;
}
