import { afterEach, describe, expect, test } from "bun:test";
import { parseRdapResponse, rdapLookup } from "./rdap.ts";
import { canResume } from "./retry.ts";
import { LimitCoordinator, MemoryLimitStore } from "./limits.ts";
import { createRun } from "./run.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseRdapResponse", () => {
  test("parses events into date fields", () => {
    const json = {
      events: [
        { eventAction: "registration", eventDate: "2015-06-06T23:59:59Z" },
        { eventAction: "expiration", eventDate: "2025-06-06T23:59:59Z" },
        { eventAction: "last changed", eventDate: "2024-02-28T12:00:00Z" },
      ],
    };
    const result = parseRdapResponse(json);
    expect(result.createdDate).toBe("2015-06-06T23:59:59Z");
    expect(result.expiryDate).toBe("2025-06-06T23:59:59Z");
    expect(result.updatedDate).toBe("2024-02-28T12:00:00Z");
  });

  test("parses registrar entity from vCard fn", () => {
    const json = {
      entities: [
        {
          roles: ["registrar"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "Cloudflare, Inc."],
            ],
          ],
        },
      ],
    };
    const result = parseRdapResponse(json);
    expect(result.registrar).toBe("Cloudflare, Inc.");
  });

  test("falls back to publicIds for registrar", () => {
    const json = {
      entities: [
        {
          roles: ["registrar"],
          publicIds: [{ type: "IANA Registrar ID", identifier: "1910" }],
        },
      ],
    };
    const result = parseRdapResponse(json);
    expect(result.registrar).toBe("1910");
  });

  test("parses registrant entity", () => {
    const json = {
      entities: [
        {
          roles: ["registrant"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "REDACTED FOR PRIVACY"],
            ],
          ],
        },
      ],
    };
    const result = parseRdapResponse(json);
    expect(result.registrant).toBe("REDACTED FOR PRIVACY");
  });

  test("parses nameservers", () => {
    const json = {
      nameservers: [
        { ldhName: "NS1.EXAMPLE.COM" },
        { ldhName: "NS2.EXAMPLE.COM" },
      ],
    };
    const result = parseRdapResponse(json);
    expect(result.nameServers).toEqual(["ns1.example.com", "ns2.example.com"]);
  });

  test("parses secureDNS", () => {
    const json = { secureDNS: { delegationSigned: true } };
    const result = parseRdapResponse(json);
    expect(result.dnssec).toBe(true);
  });

  test("parses secureDNS unsigned", () => {
    const json = { secureDNS: { delegationSigned: false } };
    const result = parseRdapResponse(json);
    expect(result.dnssec).toBe(false);
  });

  test("parses status codes", () => {
    const json = { status: ["active", "clientTransferProhibited"] };
    const result = parseRdapResponse(json);
    expect(result.statusCodes).toEqual(["active", "clientTransferProhibited"]);
  });

  test("handles missing entities gracefully", () => {
    const json = {};
    const result = parseRdapResponse(json);
    expect(result.registrar).toBeUndefined();
    expect(result.registrant).toBeUndefined();
    expect(result.nameServers).toBeUndefined();
    expect(result.createdDate).toBeUndefined();
  });

  test("handles entity without vCard or publicIds", () => {
    const json = {
      entities: [{ roles: ["registrar"] }],
    };
    const result = parseRdapResponse(json);
    expect(result.registrar).toBeUndefined();
  });
});

describe("rdapLookup", () => {
  test("sends RDAP accept and user-agent headers", async () => {
    let headers: unknown;
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      headers = init?.headers;
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(result.status).toBe("available");
    expect(headers).toEqual({
      Accept: "application/rdap+json, application/json",
      "User-Agent": "temper-domains",
    });
  });

  test("retries one rate-limited RDAP response", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response(null, { status: 503, headers: { "retry-after": "0" } });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(calls).toBe(2);
    expect(result.status).toBe("available");
  });

  test("keeps HTTP reason when RDAP remains rate limited", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 429, headers: { "retry-after": "0" } })) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(result.status).toBe("rate_limited");
    expect(result.error).toBe("HTTP 429");
  });

  test("keeps HTTP reason for unexpected RDAP errors", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(result.status).toBe("error");
    expect(result.error).toBe("HTTP 403: registry denied access");
  });

  test.each([
    ["https downgrade", "http://redirect-downgrade.test/domain/example.com"],
    ["missing Location", undefined],
    ["credentials", "https://user:pass@other.test/domain/example.com"],
    ["unsupported scheme", "ftp://other.test/example.com"],
    ["malformed Location", "https://[bad"],
  ])("a rejected redirect (%s) is an invalid response that resume does not repeat", async (name, location) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: location === undefined ? {} : { location } });
    }) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", `https://redirect-${name.replaceAll(" ", "-").toLowerCase()}.test`, new AbortController().signal);

    expect({ status: result.status, terminationReason: result.terminationReason, calls, resumable: canResume(result) })
      .toEqual({ status: "error", terminationReason: "invalid_response", calls: 1, resumable: false });
  });

  test("a redirect loop stops after five hops as an invalid response", async () => {
    let calls = 0;
    globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: `https://redirect-loop.test/domain/example.com?hop=${++calls}` } })) as unknown as typeof fetch;

    const result = await rdapLookup("example.com", "https://redirect-loop.test", new AbortController().signal);

    expect({ terminationReason: result.terminationReason, calls, resumable: canResume(result) })
      .toEqual({ terminationReason: "invalid_response", calls: 6, resumable: false });
  });

  test.each([
    // early: request spacing after a 429 (1200ms) cannot fit, so the answer returns at once.
    ["the wait ends before the deadline but request spacing does not", 429, "1", 1100, true],
    ["a zero wait still leaves request spacing past the deadline", 429, "0", 1000, true],
    // A 503 keeps normal spacing: the retry is attempted and runs out of time.
    ["a 503 wait ends just before the deadline", 503, "1", 1100, false],
  ])("keeps the limited answer and its retry time when the retry does not happen: %s", async (_name, status, retryAfter, timeoutMs, early) => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(null, { status, headers: { "retry-after": retryAfter } }); }) as unknown as typeof fetch;
    const run = createRun(timeoutMs, undefined, 1, 5000, new LimitCoordinator(new MemoryLimitStore()));
    const started = Date.now();
    try {
      const result = await rdapLookup("example.com", `https://limited-deadline-${status}-${retryAfter}.test`, run.signal, run.context);
      expect({ status: result.status, terminationReason: result.terminationReason, httpStatus: result.httpStatus, attempts: result.attempts, calls, retryAtSource: result.retryAtSource })
        .toEqual({ status: status === 429 ? "rate_limited" : "error", terminationReason: status === 429 ? "rate_limited" : "service_unavailable", httpStatus: status, attempts: 1, calls: 1, retryAtSource: "server" });
      expect(Number.isFinite(Date.parse(result.retryAt ?? ""))).toBe(true);
      if (early) expect(Date.now() - started).toBeLessThan(500);
    } finally { run.close(); }
  });

  test("still retries a limited lookup when the retry fits before the deadline", async () => {
    let calls = 0;
    globalThis.fetch = (async () => new Response(null, ++calls === 1 ? { status: 429, headers: { "retry-after": "1" } } : { status: 404 })) as unknown as typeof fetch;
    const run = createRun(4000, undefined, 1, 5000, new LimitCoordinator(new MemoryLimitStore()));
    try {
      const result = await rdapLookup("example.com", "https://limited-retry-fits.test", run.signal, run.context);
      expect({ status: result.status, calls }).toEqual({ status: "available", calls: 2 });
    } finally { run.close(); }
  });

  test("honors Retry-After before retrying and before subsequent work", async () => {
    const rdapUrl = `https://rdap-backoff-${Date.now()}.test`;
    globalThis.fetch = (async () =>
      new Response(null, { status: 429, headers: { "retry-after": "2" } })) as unknown as typeof fetch;

    const start = Date.now();
    const result = await rdapLookup("example.com", rdapUrl, new AbortController().signal);
    const afterLookup = Date.now();
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const subsequent = await rdapLookup("another.com", rdapUrl, new AbortController().signal);
    expect(subsequent.status).toBe("available");
    const afterBackoff = Date.now();

    expect(result.status).toBe("rate_limited");
    expect(afterLookup - start).toBeGreaterThanOrEqual(1950);
    expect(afterLookup - start).toBeLessThan(3000);
    expect(afterBackoff - start).toBeGreaterThanOrEqual(3950);
  });
});
