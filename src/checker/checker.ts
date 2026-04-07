import { getBootstrap, getRdapUrl } from "./bootstrap.ts";
import { getServerLimit, pLimit } from "./limiter.ts";
import { rdapLookup } from "./rdap.ts";
import type { DomainResult } from "./types.ts";
import { DEFAULT_TLDS } from "./types.ts";
import { whoisLookup } from "./whois.ts";

export async function* checkDomains(
  name: string,
  tlds: readonly string[] = DEFAULT_TLDS,
  options: { concurrency?: number; timeoutMs?: number } = {},
): AsyncGenerator<DomainResult> {
  const { concurrency = 20, timeoutMs = 3000 } = options;
  const globalLimit = pLimit(concurrency);
  const controller = new AbortController();
  const { signal } = controller;

  await getBootstrap();

  const domains = tlds.map((tld) => `${name}.${tld}`);
  const results: DomainResult[] = [];
  let resolveNext: (() => void) | null = null;

  const allDone = Promise.allSettled(
    domains.map((domain) =>
      globalLimit(async () => {
        const tld = domain.split(".").pop()!;
        const rdapUrl = getRdapUrl(tld);
        let result: DomainResult;

        try {
          if (rdapUrl) {
            const serverLimit = getServerLimit(rdapUrl);
            result = await serverLimit(() => rdapLookup(domain, rdapUrl, signal));
          } else {
            result = await whoisLookup(domain, signal);
          }
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
        resolveNext?.();
        return result;
      }),
    ),
  );

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let yielded = 0;
  while (yielded < domains.length) {
    if (yielded < results.length) {
      const result = results[yielded++];
      if (result) yield result;
    } else {
      await new Promise<void>((r) => {
        resolveNext = r;
      });
    }
  }

  clearTimeout(timeout);
  await allDone;
}
