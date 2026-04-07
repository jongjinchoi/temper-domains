import { test, expect, describe } from "bun:test";
import { buildURL, REGISTRAR_URLS } from "./urls.ts";

describe("REGISTRAR_URLS", () => {
  test("has 4 registrars", () => {
    expect(Object.keys(REGISTRAR_URLS).length).toBe(4);
  });

  test("all URLs contain %s placeholder", () => {
    for (const url of Object.values(REGISTRAR_URLS)) {
      expect(url).toContain("%s");
    }
  });
});

describe("buildURL", () => {
  test("cloudflare URL", () => {
    expect(buildURL("cloudflare", "example.com"))
      .toBe("https://domains.cloudflare.com/?domainToCheck=example.com");
  });

  test("porkbun URL", () => {
    expect(buildURL("porkbun", "example.com"))
      .toBe("https://porkbun.com/checkout/search?q=example.com");
  });

  test("namecheap URL", () => {
    expect(buildURL("namecheap", "example.com"))
      .toBe("https://www.namecheap.com/domains/registration/results/?domain=example.com");
  });

  test("vercel URL", () => {
    expect(buildURL("vercel", "example.com"))
      .toBe("https://vercel.com/domains/example.com");
  });

  test("encodes special characters in domain", () => {
    const url = buildURL("cloudflare", "test domain.com");
    expect(url).toContain("test%20domain.com");
    expect(url).not.toContain(" ");
  });
});
