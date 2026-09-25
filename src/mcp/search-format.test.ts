import { expect, test } from "bun:test";
import { formatSelectedResults } from "./search-format.ts";
import type { DomainResult } from "../checker/types.ts";

test("selected output exposes the wait source, earliest retry and zero transport attempts", () => {
  const text = formatSelectedResults(["acme"], ["app"], [{ domain: "acme.app", tld: "app", status: "rate_limited", method: "rdap", responseTime: 1,
    terminationReason: "server_cooldown", attempts: 0, retryAt: "2026-09-25T12:00:00.000Z", retryAtSource: "server" }]);
  expect(text).toContain("2026-09-25T12:00:00.000Z");
  expect(text).toContain("server Retry-After");
  expect(text).toContain("Not sent");
  expect(text).toContain("attempts: 0");
});

test("selected output keeps composite suffixes, input order, all rows and unresolved reasons", () => {
  const suffixes = ["co.uk", "uk", "design", "studio", "world", "dev", "com"];
  const results: DomainResult[] = suffixes.map((s, i) => ({ domain: `acme.${s}`, tld: s.split(".").at(-1)!, status: i === 0 ? "error" : "available", error: i === 0 ? "HTTP 503" : undefined, method: "rdap", responseTime: 1, confidence: "low", reason: "review needed" }));
  const text = formatSelectedResults(["acme"], suffixes, results.reverse(), { requested: 7, attempted: 7, answered: 6, unresolved: 1, elapsedMs: 1 });
  for (const s of suffixes) expect(text).toContain(`acme.${s}`);
  expect(text.indexOf("acme.co.uk")).toBeLessThan(text.indexOf("acme.uk"));
  expect(text.indexOf("acme.world")).toBeLessThan(text.indexOf("acme.com"));
  expect(text).toContain("HTTP 503");
  expect(text).toContain("review needed");
  expect(text).toContain("1 unresolved");
  expect(text).not.toContain("extended=true");
});

test("selected output does not add registration qualification guidance", () => {
  const text = formatSelectedResults(["acme"], ["bank"], []);
  expect(text).toContain("unresolved");
  expect(text).not.toMatch(/eligibility|registration conditions/i);
});
