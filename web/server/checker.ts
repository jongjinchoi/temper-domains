// Node-runtime port of src/checker/checker.ts — the CLI version calls
// getBootstrap() from a file-system cache, which breaks on serverless. This
// version uses the in-memory bootstrap in web/server/bootstrap.ts and accepts
// an external AbortSignal so the API route can forward browser cancellation.

import { rdapLookup } from "../../src/checker/rdap.ts";
import { whoisLookup } from "../../src/checker/whois.ts";
import { getServerLimit, pLimit } from "../../src/checker/limiter.ts";
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
  const { concurrency = 15, timeoutMs = 3000, signal: externalSignal } = options;
  const globalLimit = pLimit(concurrency);
  const controller = new AbortController();
  const { signal } = controller;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const bootstrap = await getBootstrap();

  const safeName = sanitizeDomain(name);
  const domains = tlds.map((tld) => `${safeName}.${tld}`);
  const results: DomainResult[] = [];
  let resolveNext: (() => void) | null = null;

  const allDone = Promise.allSettled(
    domains.map((domain) =>
      globalLimit(async () => {
        const tld = getTld(domain);
        const rdapUrl = getRdapUrl(bootstrap, tld);
        let result: DomainResult;

        try {
          if (rdapUrl) {
            const serverLimit = getServerLimit(rdapUrl);
            result = await serverLimit(() => rdapLookup(domain, rdapUrl, signal));
          } else {
            result = await whoisLookup(domain, signal, timeoutMs);
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

  try {
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
    await allDone;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
