import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkFullDomains, checkSuggestionMatrix } from "./checker.ts";

const originalFetch = globalThis.fetch;

describe("checkFullDomains", () => {
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
});
