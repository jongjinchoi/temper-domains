import { pLimit } from "./limiter.ts";
import type { DomainResult } from "./types.ts";

export interface CheckOptions {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function* streamDomainResults(
  domains: readonly string[],
  options: CheckOptions,
  checkDomain: (domain: string, signal: AbortSignal) => Promise<DomainResult>,
): AsyncGenerator<DomainResult> {
  const { concurrency = 20, timeoutMs = 3000, signal: externalSignal } = options;
  const globalLimit = pLimit(concurrency);
  const controller = new AbortController();
  const { signal } = controller;
  const results: DomainResult[] = [];
  let resolveNext: (() => void) | null = null;

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const allDone = Promise.allSettled(
    domains.map((domain) =>
      globalLimit(async () => {
        const result = await checkDomain(domain, signal);
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
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
    controller.abort();
  }
}
