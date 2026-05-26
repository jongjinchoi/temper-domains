import { describe, expect, test } from "bun:test";
import { formatFullDomainResults, formatResults } from "./server.ts";
import type { DomainResult } from "../checker/types.ts";

const result = (
  domain: string,
  tld: string,
  status: DomainResult["status"] = "available",
  responseTime = 10,
  error?: string,
): DomainResult => ({
  domain,
  tld,
  status,
  method: "rdap",
  responseTime,
  error,
});

describe("formatResults", () => {
  test("orders MCP search output by requested TLD order, not completion order", () => {
    const text = formatResults(
      "caulder",
      [
        result("caulder.org", "org"),
        result("caulder.com", "com", "taken"),
        result("caulder.net", "net"),
      ],
      ["com", "net", "org"],
    );

    expect(text.indexOf("caulder.com")).toBeLessThan(text.indexOf("caulder.net"));
    expect(text.indexOf("caulder.net")).toBeLessThan(text.indexOf("caulder.org"));
  });

  test("reports default TLDs before extended TLDs for extended searches", () => {
    const text = formatResults(
      "caulder",
      [
        result("caulder.world", "world"),
        result("caulder.com", "com"),
        result("caulder.one", "one"),
        result("caulder.net", "net"),
      ],
      ["com", "net", "one", "world"],
    );

    expect(text).toContain("Default TLDs:");
    expect(text).toContain("Extended TLDs:");
    expect(text.indexOf("Default TLDs:")).toBeLessThan(text.indexOf("caulder.com"));
    expect(text.indexOf("caulder.net")).toBeLessThan(text.indexOf("Extended TLDs:"));
    expect(text.indexOf("Extended TLDs:")).toBeLessThan(text.indexOf("caulder.one"));
    expect(text.indexOf("caulder.one")).toBeLessThan(text.indexOf("caulder.world"));
  });

  test("keeps unexpected TLD results visible after ordered results", () => {
    const text = formatResults(
      "caulder",
      [
        result("caulder.extra", "extra"),
        result("caulder.com", "com"),
      ],
      ["com"],
    );

    expect(text.indexOf("caulder.com")).toBeLessThan(text.indexOf("caulder.extra"));
    expect(text).toContain("caulder.extra");
  });

  test("includes short error reasons when present", () => {
    const text = formatResults(
      "caulder",
      [{
        ...result("caulder.tv", "tv", "error"),
        error: "HTTP 403",
      }],
      ["tv"],
    );

    expect(text).toContain("caulder.tv");
    expect(text).toContain("HTTP 403");
  });
});

describe("formatFullDomainResults", () => {
  test("orders output by requested full-domain order, not completion order", () => {
    const text = formatFullDomainResults(
      ["caulder.com", "caulder.net", "caulder.org"],
      [
        result("caulder.org", "org"),
        result("caulder.com", "com", "taken"),
        result("caulder.net", "net"),
      ],
    );

    expect(text.indexOf("caulder.com")).toBeLessThan(text.indexOf("caulder.net"));
    expect(text.indexOf("caulder.net")).toBeLessThan(text.indexOf("caulder.org"));
  });

  test("uses warning icons and includes short error reasons for review states", () => {
    const text = formatFullDomainResults(
      ["caulder.tv", "caulder.ai", "caulder.dev", "bad_domain.com"],
      [
        result("caulder.tv", "tv", "error", 211, "HTTP 403"),
        result("caulder.ai", "ai", "rate_limited", 1010, "HTTP 429"),
        result("caulder.dev", "dev", "slow", 5000),
        result("bad_domain.com", "com", "error", 0, "Invalid domain"),
      ],
    );

    expect(text).toContain("⚠ caulder.tv");
    expect(text).toContain("HTTP 403");
    expect(text).toContain("⚠ caulder.ai");
    expect(text).toContain("HTTP 429");
    expect(text).toContain("⚠ caulder.dev");
    expect(text).toContain("⚠ bad_domain.com");
    expect(text).toContain("Invalid domain");
    expect(text).toMatch(/rdap\s+211ms/);
    expect(text).toMatch(/rdap\s+5000ms/);
    expect(text).not.toContain("✗ caulder.tv");
  });

  test("summarizes available, taken, and review counts", () => {
    const text = formatFullDomainResults(
      ["caulder.com", "caulder.net", "caulder.tv"],
      [
        result("caulder.com", "com"),
        result("caulder.net", "net", "taken"),
        result("caulder.tv", "tv", "error", 211, "HTTP 403"),
      ],
    );

    expect(text).toContain("Summary: 1 available, 1 taken, 1 to review (3 checked)");
  });
});
