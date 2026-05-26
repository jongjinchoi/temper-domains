import { describe, expect, test } from "bun:test";
import { formatResults } from "./server.ts";
import type { DomainResult } from "../checker/types.ts";

const result = (
  domain: string,
  tld: string,
  status: DomainResult["status"] = "available",
  responseTime = 10,
): DomainResult => ({
  domain,
  tld,
  status,
  method: "rdap",
  responseTime,
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
