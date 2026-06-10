import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkDomains, checkFullDomains, checkSuggestionMatrix } from "./checker.ts";
import type { DomainResult } from "./types.ts";

const originalFetch = globalThis.fetch;

interface PendingRdapRequest {
  resolve: (status?: number) => void;
  reject: (err?: Error) => void;
}

function rdapUrlsFor(tlds: readonly string[], prefix = ""): Map<string, string> {
  return new Map(tlds.map((tld) => [tld, `https://rdap-${prefix}${tld}.test`]));
}

function rdapDomainFromRequest(input: Parameters<typeof fetch>[0]): string {
  const url = new URL(String(input));
  return decodeURIComponent(url.pathname.split("/domain/")[1] ?? "");
}

function waitFor(predicate: () => boolean, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > 1000) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 1);
    };
    tick();
  });
}

async function collectResults(iterable: AsyncIterable<DomainResult>): Promise<DomainResult[]> {
  const results: DomainResult[] = [];
  for await (const result of iterable) results.push(result);
  return results;
}

function installControlledFetch() {
  const pending = new Map<string, PendingRdapRequest>();
  let active = 0;
  let maxActive = 0;

  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const domain = rdapDomainFromRequest(input);
    const signal = (init?.signal ?? null) as AbortSignal | null;
    active++;
    maxActive = Math.max(maxActive, active);

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        pending.delete(domain);
      };
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        active--;
        fn();
      };
      const onAbort = () => {
        finish(() => reject(new DOMException("Aborted", "AbortError")));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });
      pending.set(domain, {
        resolve: (status = 404) => finish(() => resolve(new Response(null, { status }))),
        reject: (err = new Error("fetch failed")) => finish(() => reject(err)),
      });
    });
  }) as unknown as typeof fetch;

  return {
    pending,
    get active() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
  };
}

describe("checker", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("/domain/available.com")) {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/domain/taken.com")) {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("checks full domains through RDAP without a DNS precheck", async () => {
    const results = [];
    const rdapUrls = new Map([["com", "https://rdap.test"]]);

    for await (const result of checkFullDomains(["available.com", "taken.com"], { rdapUrls })) {
      results.push(result);
    }

    const byDomain = new Map(results.map((result) => [result.domain, result]));
    expect(byDomain.get("available.com")?.status).toBe("available");
    expect(byDomain.get("available.com")?.method).toBe("rdap");
    expect(byDomain.get("taken.com")?.status).toBe("taken");
    expect(byDomain.get("taken.com")?.method).toBe("rdap");
  });

  test("returns error for invalid full domains before network lookup", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const results = [];
    const rdapUrls = new Map([["com", "https://rdap.test"]]);

    for await (const result of checkFullDomains(["bad_domain.com"], { rdapUrls })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.error).toBe("Invalid domain");
    expect(calls).toBe(0);
  });

  test("uses longest RDAP bootstrap key and exposes PSL metadata", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requestedUrl = String(input);
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const results = [];
    const rdapUrls = new Map([
      ["uk", "https://rdap-uk.test"],
      ["co.uk", "https://rdap-co-uk.test"],
    ]);

    for await (const result of checkFullDomains(["sample.co.uk"], { rdapUrls })) {
      results.push(result);
    }

    expect(requestedUrl.startsWith("https://rdap-co-uk.test/")).toBe(true);
    expect(results[0]?.tld).toBe("uk");
    expect(results[0]?.rdapKey).toBe("co.uk");
    expect(results[0]?.publicSuffix).toBe("co.uk");
    expect(results[0]?.registrableDomain).toBe("sample.co.uk");
    expect(results[0]?.confidence).toBe("medium");
    expect(results[0]?.reason).toContain("RDAP returned no domain object");
  });

  test("rejects public suffix inputs before network lookup", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const results = [];
    const rdapUrls = new Map([["co.uk", "https://rdap-co-uk.test"]]);

    for await (const result of checkFullDomains(["co.uk"], { rdapUrls })) {
      results.push(result);
    }

    expect(results[0]?.status).toBe("error");
    expect(results[0]?.confidence).toBe("low");
    expect(results[0]?.error).toContain("public suffix");
    expect(calls).toBe(0);
  });

  test("checks suggestion names through RDAP/WHOIS full-domain lookup", async () => {
    const groups = await checkSuggestionMatrix(
      ["caulder", "lockway"],
      ["com", "dev"],
      { rdapUrls: new Map([["com", "https://rdap.test"], ["dev", "https://rdap.test"]]) },
    );

    const caulder = groups.find((group) => group.name === "caulder");
    const lockway = groups.find((group) => group.name === "lockway");

    expect(caulder?.results).toHaveLength(2);
    expect(lockway?.results).toHaveLength(2);
    expect(caulder?.results.map((result) => result.domain)).toEqual(["caulder.com", "caulder.dev"]);
    expect(lockway?.results.map((result) => result.domain)).toEqual(["lockway.com", "lockway.dev"]);
    expect(caulder?.results.every((result) => result.method === "rdap")).toBe(true);
  });

  test("yields checkDomains results in completion order", async () => {
    const tlds = ["com", "net", "org"] as const;
    const fetchMock = installControlledFetch();
    const iterator = checkDomains("sample", tlds, {
      rdapUrls: rdapUrlsFor(tlds, "order-"),
      concurrency: 3,
      timeoutMs: 1000,
    });

    const first = iterator.next();
    await waitFor(() => fetchMock.pending.size === 3, "all RDAP requests to start");

    fetchMock.pending.get("sample.net")?.resolve(404);
    expect((await first).value?.domain).toBe("sample.net");

    const second = iterator.next();
    fetchMock.pending.get("sample.org")?.resolve(200);
    const secondResult = await second;
    expect(secondResult.value?.domain).toBe("sample.org");
    expect(secondResult.value?.status).toBe("taken");

    const third = iterator.next();
    fetchMock.pending.get("sample.com")?.resolve(404);
    expect((await third).value?.domain).toBe("sample.com");
    expect((await iterator.next()).done).toBe(true);
  });

  test("yields completed results and slow rows after timeout abort", async () => {
    const tlds = ["com", "net"] as const;
    const fetchMock = installControlledFetch();
    const resultsPromise = collectResults(checkDomains("sample", tlds, {
      rdapUrls: rdapUrlsFor(tlds, "timeout-"),
      concurrency: 2,
      timeoutMs: 50,
    }));

    await waitFor(() => fetchMock.pending.size === 2, "both RDAP requests to start");
    fetchMock.pending.get("sample.com")?.resolve(404);

    const results = await resultsPromise;
    const byDomain = new Map(results.map((result) => [result.domain, result]));
    expect(byDomain.get("sample.com")?.status).toBe("available");
    expect(byDomain.get("sample.net")?.status).toBe("slow");
  });

  test("external abort marks pending checkDomains results as slow", async () => {
    const tlds = ["com", "net"] as const;
    const fetchMock = installControlledFetch();
    const controller = new AbortController();
    const resultsPromise = collectResults(checkDomains("sample", tlds, {
      rdapUrls: rdapUrlsFor(tlds, "external-abort-"),
      concurrency: 2,
      timeoutMs: 1000,
      signal: controller.signal,
    }));

    await waitFor(() => fetchMock.pending.size === 2, "both RDAP requests to start");
    controller.abort();

    const results = await resultsPromise;
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "slow")).toBe(true);
  });

  test("checkDomains respects the configured concurrency ceiling", async () => {
    const tlds = ["com", "net", "org", "dev"] as const;
    const fetchMock = installControlledFetch();
    const resultsPromise = collectResults(checkDomains("sample", tlds, {
      rdapUrls: rdapUrlsFor(tlds, "concurrency-"),
      concurrency: 2,
      timeoutMs: 1000,
    }));

    await waitFor(() => fetchMock.pending.size === 2, "first two RDAP requests to start");
    expect(fetchMock.active).toBe(2);
    expect(fetchMock.maxActive).toBe(2);

    fetchMock.pending.get("sample.com")?.resolve(404);
    await waitFor(() => fetchMock.pending.has("sample.org"), "third RDAP request to start");
    expect(fetchMock.maxActive).toBe(2);

    fetchMock.pending.get("sample.net")?.resolve(404);
    await waitFor(() => fetchMock.pending.has("sample.dev"), "fourth RDAP request to start");
    expect(fetchMock.maxActive).toBe(2);

    fetchMock.pending.get("sample.org")?.resolve(404);
    fetchMock.pending.get("sample.dev")?.resolve(404);

    const results = await resultsPromise;
    expect(results).toHaveLength(4);
    expect(fetchMock.maxActive).toBe(2);
  });
});
