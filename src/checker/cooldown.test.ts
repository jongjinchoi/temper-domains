import { afterEach, expect, test } from "bun:test";
import { checkFullDomains } from "./checker.ts";
import { retryAfterDelay } from "./rdap.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("a server cooldown reports unrequested domains without waiting for the search deadline", async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response(null, { status: 429, headers: { "retry-after": "86400" } }); }) as unknown as typeof fetch;
  const rows = [];
  for await (const row of checkFullDomains(["first.com", "second.com"], {
    rdapUrls: new Map([["com", `https://${crypto.randomUUID()}.test/rdap/`]]), timeoutMs: 800,
  })) rows.push(row);
  expect(requests).toBe(1);
  expect(rows.find(row => row.domain === "first.com")).toMatchObject({ status: "rate_limited", attempts: 1, terminationReason: "rate_limited", retryAtSource: "server" });
  expect(rows.find(row => row.domain === "second.com")).toMatchObject({ status: "rate_limited", attempts: 0, terminationReason: "server_cooldown", retryAtSource: "server" });
});

test("a missing Retry-After does not cause another request after just 500ms", async () => {
  let requests = 0;
  const start = Date.now();
  globalThis.fetch = (async () => { requests++; return new Response(null, { status: 429 }); }) as unknown as typeof fetch;
  const rows = [];
  for await (const row of checkFullDomains(["first.com"], {
    rdapUrls: new Map([["com", `https://${crypto.randomUUID()}.test/rdap/`]]), timeoutMs: 1500,
  })) rows.push(row);
  expect(requests).toBe(1);
  expect(rows[0]).toMatchObject({ status: "rate_limited", retryAtSource: "client_policy" });
  expect(Date.parse(rows[0]!.retryAt!) - start).toBeGreaterThanOrEqual(60000);
});

test("duplicate normalized domains share a request and still produce each requested row", async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response(null, { status: 404 }); }) as unknown as typeof fetch;
  const rows = [];
  for await (const row of checkFullDomains(["FIRST.com", "first.com"], {
    rdapUrls: new Map([["com", `https://${crypto.randomUUID()}.test/rdap/`]]), timeoutMs: 1500,
  })) rows.push(row);
  expect(rows).toHaveLength(2);
  expect(rows.every(row => row.status === "available")).toBe(true);
  expect(requests).toBe(1);
});

test("service cooldown keeps 503 distinct while a different server completes", async () => {
  const blocked = `https://${crypto.randomUUID()}.test/`;
  const working = `https://${crypto.randomUUID()}.test/`;
  const requests: string[] = [];
  globalThis.fetch = (async input => {
    requests.push(String(input));
    return String(input).startsWith(blocked)
      ? new Response(null, { status: 503, headers: { "Retry-After": "86400" } })
      : new Response(null, { status: 404 });
  }) as typeof fetch;
  const rows = [];
  for await (const row of checkFullDomains(["first.com", "second.com", "other.net"], {
    rdapUrls: new Map([["com", blocked], ["net", working]]), timeoutMs: 1500,
  })) rows.push(row);
  expect(rows.find(row => row.domain === "first.com")).toMatchObject({ status: "error", terminationReason: "service_unavailable", attempts: 1 });
  expect(rows.find(row => row.domain === "second.com")).toMatchObject({ status: "error", terminationReason: "server_cooldown", attempts: 0 });
  expect(rows.find(row => row.domain === "other.net")?.status).toBe("available");
  expect(requests).toHaveLength(2);
});

test("missing and invalid server waits use policy, but valid zero remains server-directed", () => {
  for (const value of [null, "", "not-a-date", "-1", "1.5"]) expect(retryAfterDelay(value)).toBeUndefined();
  expect(retryAfterDelay("0")).toBe(0);
  expect(retryAfterDelay("86400")).toBe(86400000);
});
