import { describe, expect, test } from "bun:test";
import {
  CHECK_DOMAIN_AVAILABILITY_DESCRIPTION,
  MCP_INSTRUCTIONS,
  SEARCH_NAMES_DESCRIPTION,
  findBareDomainInputs,
  formatBareDomainInputError,
  formatFullDomainResults,
  formatResults,
  formatSuggestDomainResults,
  formatSearchNamesResults,
  normalizeSearchDomainInput,
} from "./server.ts";
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

  test("includes confidence when availability needs confirmation", () => {
    const text = formatResults(
      "caulder",
      [{
        ...result("caulder.xyz", "xyz"),
        confidence: "medium",
        reason: "RDAP returned no domain object",
      }],
      ["xyz"],
    );

    expect(text).toContain("medium confidence");
    expect(text).toContain("RDAP returned no domain object");
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

  test("counts low-confidence available results as review", () => {
    const text = formatFullDomainResults(
      ["caulder.com", "caulder.xyz"],
      [
        result("caulder.com", "com"),
        {
          ...result("caulder.xyz", "xyz"),
          confidence: "low",
          reason: "Registry policy requires review",
        },
      ],
    );

    expect(text).toContain("⚠ caulder.xyz");
    expect(text).toContain("low confidence");
    expect(text).toContain("Summary: 1 available, 0 taken, 1 to review (2 checked)");
  });
});

describe("MCP bare-name routing", () => {
  test("instructions route bare names to search tools before full-domain checks", () => {
    expect(MCP_INSTRUCTIONS).toContain("Bare names");
    expect(MCP_INSTRUCTIONS).toContain("search_domain or search_names");
    expect(MCP_INSTRUCTIONS).toContain("default 30 TLDs first");
    expect(MCP_INSTRUCTIONS).toContain("Do not infer, append, or choose TLDs");
  });

  test("check_domain_availability description forbids inferred TLDs", () => {
    expect(CHECK_DOMAIN_AVAILABILITY_DESCRIPTION).toContain("explicitly provided by the user");
    expect(CHECK_DOMAIN_AVAILABILITY_DESCRIPTION).toContain("Do not infer, append, or choose TLDs");
    expect(CHECK_DOMAIN_AVAILABILITY_DESCRIPTION).toContain("search_domain or search_names");
  });

  test("search_names description is for bare generated names", () => {
    expect(SEARCH_NAMES_DESCRIPTION).toContain("bare name candidates");
    expect(SEARCH_NAMES_DESCRIPTION).toContain("Default 30 TLDs first");
  });

  test("detects bare names passed to full-domain checks", () => {
    expect(findBareDomainInputs(["lockway", "lockway.com", " hatchway "])).toEqual(["lockway", "hatchway"]);
    expect(formatBareDomainInputError(["lockway"])).toContain("Use search_domain for one bare name");
  });

  test("validates search_domain input as one bare name", () => {
    expect(normalizeSearchDomainInput(" LockWay ")).toEqual({ name: "lockway" });
    expect(normalizeSearchDomainInput("lockway.com").error).toContain("Use check_domain_availability");
    expect(normalizeSearchDomainInput("bad_name").error).toContain("not a valid bare domain name");
  });

  test("summarizes search_names output with .com first and default options before extended options", () => {
    const text = formatSearchNamesResults(
      [{
        name: "lockway",
        results: [
          result("lockway.dev", "dev"),
          result("lockway.one", "one"),
          result("lockway.com", "com", "taken"),
          result("lockway.app", "app"),
        ],
      }],
      ["com", "dev", "app", "one"],
    );

    expect(text.indexOf(".com")).toBeLessThan(text.indexOf("Available default options"));
    expect(text).toContain("Available default options: lockway.dev, lockway.app");
    expect(text).toContain("Available extended options: lockway.one");
  });

  test("formats suggest_domain review states without marking them as taken", () => {
    const text = formatSuggestDomainResults(
      [{
        name: "lockway",
        results: [
          result("lockway.com", "com", "taken"),
          result("lockway.dev", "dev", "rate_limited", 1000, "HTTP 429"),
          result("lockway.io", "io", "slow", 5000),
        ],
      }],
      ["com", "dev", "io"],
    );

    expect(text).toContain("✗");
    expect(text).toContain("⚠");
    expect(text).toContain("1 taken, 2 to review");
    expect(text).toContain("⚠ lockway.dev rate_limited  HTTP 429");
    expect(text).toContain("⚠ lockway.io slow");
  });
});
