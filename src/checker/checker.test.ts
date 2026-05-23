import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkFullDomains } from "./checker.ts";

const originalFetch = globalThis.fetch;

describe("checkFullDomains", () => {
  beforeEach(() => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/domain/available.com")) {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/domain/taken.com")) {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 500 });
    };
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
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 200 });
    };

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
});
