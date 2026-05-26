import { afterEach, describe, expect, test } from "bun:test";
import { parseRdapResponse, rdapLookup } from "./rdap.ts";

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
    let headers: HeadersInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      headers = init?.headers;
      return new Response(null, { status: 404 });
    }) as typeof fetch;

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
    }) as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(calls).toBe(2);
    expect(result.status).toBe("available");
  });

  test("keeps HTTP reason when RDAP remains rate limited", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 429, headers: { "retry-after": "0" } })) as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(result.status).toBe("rate_limited");
    expect(result.error).toBe("HTTP 429");
  });

  test("keeps HTTP reason for unexpected RDAP errors", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 403 })) as typeof fetch;

    const result = await rdapLookup("example.com", "https://rdap.test", new AbortController().signal);

    expect(result.status).toBe("error");
    expect(result.error).toBe("HTTP 403");
  });
});
