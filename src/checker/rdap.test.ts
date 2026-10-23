import { afterEach, describe, expect, test } from "bun:test";
import { parseRdapResponse, rdapLookup } from "./rdap.ts";
import { canResume } from "./retry.ts";
import { LimitCoordinator, LimitStateError, MemoryLimitStore, type LimitState } from "./limits.ts";
import { createRun } from "./run.ts";
import { runWhoisRequest } from "./whois-request.ts";
import type { DomainResult } from "./types.ts";

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

  test.each([
    ["a string", "active", undefined],
    ["an object", { active: true }, undefined],
    ["a mixed array", ["active", 1, null, "clientHold"], ["active", "clientHold"]],
    ["an array without strings", [1, 2], undefined],
  ])("ignores status that is %s instead of a string array", (_name, status, expected) => {
    expect(parseRdapResponse({ status }).statusCodes).toEqual(expected);
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

  test("returns registration details only when requested, never the registrant", async () => {
    globalThis.fetch = (async () => Response.json({
      objectClassName: "domain", ldhName: "example.com", status: ["client transfer prohibited"],
      events: [
        { eventAction: "registration", eventDate: "2015-06-06T23:59:59Z" },
        { eventAction: "expiration", eventDate: "2027-06-06T23:59:59Z" },
      ],
      entities: [
        { roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Example Registrar"]]] },
        { roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Private Person"]]] },
      ],
      nameservers: [{ ldhName: "ns1.example.com" }],
    })) as unknown as typeof fetch;

    const plain = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);
    const detailed = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal, undefined, true);

    expect(plain.status).toBe("taken");
    for (const key of ["expiryDate", "registrar", "statusCodes", "registrant", "nameServers", "createdDate", "rawRdap"]) {
      expect(plain).not.toHaveProperty(key);
    }
    expect(detailed).toMatchObject({ status: "taken", expiryDate: "2027-06-06T23:59:59Z",
      registrar: "Example Registrar", statusCodes: ["client transfer prohibited"] });
    for (const key of ["registrant", "nameServers", "createdDate", "rawRdap"]) expect(detailed).not.toHaveProperty(key);
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

// Simulates lookup state that becomes unavailable after the request was sent:
// "all" fails every later update (answered and release), "once" only the next.
class FailingAfterSendStore extends MemoryLimitStore {
  mode: "off" | "once" | "all" = "off";
  override async update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> {
    if (this.mode !== "off") {
      if (this.mode === "once") this.mode = "off";
      throw new LimitStateError("injected state failure");
    }
    return super.update(change, signal);
  }
}

describe("answers survive a failed lookup-state record", () => {
  test.each([
    ["200 after answered and release fail", 200, "all", "taken"],
    ["404 after answered and release fail", 404, "all", "available"],
    ["200 after only answered fails", 200, "once", "taken"],
  ] as const)("keeps the server answer: %s", async (_name, status, mode, expected) => {
    const store = new FailingAfterSendStore();
    globalThis.fetch = (async () => {
      store.mode = mode;
      return status === 200 ? Response.json({ objectClassName: "domain", ldhName: "example.com" }) : new Response(null, { status });
    }) as unknown as typeof fetch;
    const run = createRun(4000, undefined, 1, 5000, new LimitCoordinator(store));
    try {
      const result = await rdapLookup("example.com", `https://state-failure-${status}-${mode}.test`, run.signal, run.context);
      expect({ status: result.status, httpStatus: result.httpStatus, terminationReason: result.terminationReason })
        .toEqual({ status: expected, httpStatus: status, terminationReason: undefined });
    } finally { run.close(); }
  });

  test("a failed cooldown record after 429 still stops the lookup", async () => {
    const store = new FailingAfterSendStore();
    globalThis.fetch = (async () => {
      store.mode = "all";
      return new Response(null, { status: 429, headers: { "retry-after": "60" } });
    }) as unknown as typeof fetch;
    const run = createRun(4000, undefined, 1, 5000, new LimitCoordinator(store));
    try {
      const result = await rdapLookup("example.com", "https://state-failure-429.test", run.signal, run.context);
      expect({ status: result.status, terminationReason: result.terminationReason }).toEqual({ status: "error", terminationReason: "limit_state_error" });
    } finally { run.close(); }
  });

  test("keeps a WHOIS answer when the state record fails", async () => {
    const store = new FailingAfterSendStore();
    const run = createRun(4000, undefined, 1, 5000, new LimitCoordinator(store));
    try {
      const result = await runWhoisRequest("example.io", run.signal, run.context, async () => {
        store.mode = "all";
        return { domain: "example.io", tld: "io", status: "taken", method: "whois", responseTime: 1 } as DomainResult;
      });
      expect(result.status).toBe("taken");
    } finally { run.close(); }
  });
});
