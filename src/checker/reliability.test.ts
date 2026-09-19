import { afterEach, expect, test } from "bun:test";
import { checkFullDomains } from "./checker.ts";
import { rdapLookup, rdapDetail } from "./rdap.ts";
import type { DomainResult } from "./types.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
async function collect(source: AsyncIterable<DomainResult>) {
  const rows: DomainResult[] = [];
  for await (const row of source) rows.push(row);
  return rows;
}
const endpoint = () => `https://${crypto.randomUUID()}.test/rdap/`;

test("automatic budget dispatches all 21 domains sharing one server", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  const domains = Array.from({ length: 21 }, (_, i) => `sample${i}.com`);
  const rows = await collect(checkFullDomains(domains, { rdapUrls: new Map([["com", endpoint()]]) }));
  expect(rows).toHaveLength(21);
  expect(rows.filter(r => r.status === "available")).toHaveLength(21);
}, 15000);

test("waiting same-server jobs do not occupy another server's global slots", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  const rows = await collect(checkFullDomains(["a.com", "b.com", "c.com", "other.net"], {
    rdapUrls: new Map([["com", endpoint()], ["net", endpoint()]]), concurrency: 1, timeoutMs: 100,
  }));
  expect(rows.find(r => r.domain === "other.net")?.status).toBe("available");
  expect(rows.find(r => r.domain === "b.com")?.terminationReason).toBe("deadline_before_start");
});

test("Retry-After delays both retry and already queued domains", async () => {
  const starts: number[] = [];
  const start = Date.now();
  globalThis.fetch = (async () => {
    starts.push(Date.now() - start);
    return starts.length === 1
      ? new Response(null, { status: 429, headers: { "retry-after": "2" } })
      : new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const rows = await collect(checkFullDomains(["a.com", "b.com"], {
    rdapUrls: new Map([["com", endpoint()]]), timeoutMs: 4000,
  }));
  expect(rows.every(r => r.status === "available")).toBe(true);
  expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1950);
  expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(290);
}, 6000);

test("long Retry-After returns rate limit with retry time without early retry", async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return new Response(null, { status: 429, headers: { "retry-after": "120" } });
  }) as unknown as typeof fetch;
  const rows = await collect(checkFullDomains(["a.com"], {
    rdapUrls: new Map([["com", endpoint()]]), timeoutMs: 150,
  }));
  expect(rows[0]?.status).toBe("rate_limited");
  expect(rows[0]?.attempts).toBe(1);
  expect(Date.parse(rows[0]?.retryAt ?? "") - Date.now()).toBeGreaterThan(118000);
  expect(requests).toBe(1);
});

for (const [name, body] of [["HTML", "<html>error</html>"], ["empty object", "{}"], ["wrong domain", JSON.stringify({ objectClassName: "domain", ldhName: "other.com" })]]) {
  test(`search and detail reject ${name} in HTTP 200`, async () => {
    globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch;
    for (const lookup of [rdapLookup, rdapDetail]) {
      const row = await lookup("a.com", endpoint(), new AbortController().signal);
      expect(row.status).toBe("error");
      expect(row.terminationReason).toBe("invalid_response");
    }
  });
}

test("request timeout starts at dispatch and is distinct from an unstarted deadline", async () => {
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  })) as unknown as typeof fetch;
  const rows = await collect(checkFullDomains(["a.com", "b.com"], {
    rdapUrls: new Map([["com", endpoint()]]), timeoutMs: 150, requestTimeoutMs: 40,
  }));
  expect(rows.find(r => r.domain === "a.com")?.terminationReason).toBe("request_timeout");
  expect(rows.find(r => r.domain === "a.com")?.attempts).toBe(1);
  expect(rows.find(r => r.domain === "b.com")?.terminationReason).toBe("deadline_before_start");
  expect(rows.find(r => r.domain === "b.com")?.attempts).toBe(0);
});

test("cancelling one run leaves another run on the shared server intact", async () => {
  const base = endpoint();
  const controller = new AbortController();
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (String(input).includes("/a.com")) return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const rdapUrls = new Map([["com", base]]);
  const cancelled = collect(checkFullDomains(["a.com"], { rdapUrls, signal: controller.signal }));
  const other = collect(checkFullDomains(["b.com"], { rdapUrls }));
  setTimeout(() => controller.abort(), 30);
  expect((await cancelled)[0]?.terminationReason).toBe("cancelled");
  expect((await other)[0]?.status).toBe("available");
});

test("HTTP 503 is service unavailable, not a rate limit", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 503, headers: { "retry-after": "60" } })) as unknown as typeof fetch;
  const row = await rdapLookup("a.com", endpoint(), new AbortController().signal);
  expect(row.status).toBe("error");
  expect(row.terminationReason).toBe("service_unavailable");
});

test("successful responses accept optional identifiers and unknown extensions", async () => {
  globalThis.fetch = (async () => Response.json({ objectClassName: "domain", example_extension: 42 })) as unknown as typeof fetch;
  expect((await rdapLookup("a.com", endpoint(), new AbortController().signal)).status).toBe("taken");
});

test("summary counts answers separately from attempts and terminal rows", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  let summary: import("./types.ts").CheckSummary | undefined;
  await collect(checkFullDomains(["a.com", "b.com"], {
    rdapUrls: new Map([["com", endpoint()]]), timeoutMs: 100, onSummary: value => { summary = value; },
  }));
  expect(summary).toMatchObject({ requested: 2, attempted: 1, answered: 1, unresolved: 1 });
  expect(summary!.elapsedMs).toBeGreaterThanOrEqual(90);
});

test("an already cancelled run never starts bootstrap", async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return Response.json({ services: [[["com"], [endpoint()]]] }); }) as unknown as typeof fetch;
  const controller = new AbortController(); controller.abort();
  const rows = await collect(checkFullDomains(["a.com"], { signal: controller.signal }));
  await Bun.sleep(20);
  expect(rows[0]?.terminationReason).toBe("cancelled");
  expect(requests).toBe(0);
});

import { checkDomainBatch } from "./batch.ts";
import { parseRetryAfter } from "./rdap.ts";

test("whole-run deadline includes bootstrap without cancelling the shared load", async () => {
  let finish!: (map: Map<string, string>) => void;
  const shared = new Promise<Map<string, string>>(resolve => { finish = resolve; });
  const early = collect(checkDomainBatch(["a.com"], { timeoutMs: 30 }, () => shared));
  const later = collect(checkDomainBatch(["b.com"], { timeoutMs: 500 }, () => shared));
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  const rows = await early;
  expect(rows[0]?.terminationReason).toBe("deadline_before_start");
  finish(new Map([["com", endpoint()]]));
  expect((await later)[0]?.status).toBe("available");
});

test("Retry-After parses HTTP dates and does not cap long delays", () => {
  const now = Date.UTC(2026, 8, 19, 0, 0, 0);
  expect(parseRetryAfter("Sat, 19 Sep 2026 00:02:00 GMT", now)).toBe(120000);
  expect(parseRetryAfter("3600", now)).toBe(3600000);
  expect(parseRetryAfter("-1", now)).toBe(500);
  expect(parseRetryAfter("1.5", now)).toBe(500);
});

test("IDN responses compare normalized domain identifiers", async () => {
  globalThis.fetch = (async () => Response.json({ objectClassName: "domain", ldhName: "XN--BCHER-KVA.COM", unicodeName: "bücher.com" })) as unknown as typeof fetch;
  expect((await rdapLookup("xn--bcher-kva.com", endpoint(), new AbortController().signal)).status).toBe("taken");
});

test("unstarted results include the time actually spent queued", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  const rows = await collect(checkFullDomains(["a.com", "b.com"], { rdapUrls: new Map([["com", endpoint()]]), timeoutMs: 100 }));
  expect(rows.find(row => row.domain === "b.com")?.queueTimeMs).toBeGreaterThanOrEqual(90);
});

test("malformed detail fields are response errors rather than network failures", async () => {
  globalThis.fetch = (async () => Response.json({ objectClassName: "domain", entities: "broken" })) as unknown as typeof fetch;
  const row = await rdapDetail("a.com", endpoint(), new AbortController().signal);
  expect(row.terminationReason).toBe("invalid_response");
});

test("missing WHOIS routes are not counted as network attempts", async () => {
  const rows = await collect(checkFullDomains(["example.com"], { rdapUrls: new Map() }));
  expect(rows[0]?.status).toBe("error");
  expect(rows[0]?.attempts).toBe(0);
});
