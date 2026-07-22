import { describe, expect, test } from "bun:test";
import { findRdapBootstrapKey, getTld, parseDomain } from "./domain.ts";
import { isValidDomain, isValidDomainLabel } from "./validate.ts";

describe("domain parsing", () => {
  test("extracts PSL metadata for multi-label public suffixes", () => {
    const parsed = parseDomain("Example.CO.UK");

    expect(parsed.asciiDomain).toBe("example.co.uk");
    expect(parsed.tld).toBe("uk");
    expect(parsed.publicSuffix).toBe("co.uk");
    expect(parsed.registrableDomain).toBe("example.co.uk");
    expect(getTld("example.co.uk")).toBe("uk");
  });

  test("normalizes IDN labels to ASCII for validation", () => {
    const parsed = parseDomain("bücher.de");

    expect(parsed.asciiDomain).toBe("xn--bcher-kva.de");
    expect(parsed.publicSuffix).toBe("de");
    expect(parsed.registrableDomain).toBe("xn--bcher-kva.de");
    expect(isValidDomain("bücher.de")).toBe(true);
    expect(isValidDomainLabel("bücher")).toBe(true);
  });

  test("rejects dots in bare labels and empty labels in full domains", () => {
    expect(isValidDomainLabel("foo.")).toBe(false);
    expect(isValidDomainLabel("foo.bar")).toBe(false);
    expect(isValidDomain("foo..bar")).toBe(false);
    expect(isValidDomain("example.com.")).toBe(false);
    expect(isValidDomain(".example.com")).toBe(false);
  });

  test("finds the longest RDAP bootstrap key by label", () => {
    const keys = new Set(["uk", "co.uk"]);

    expect(findRdapBootstrapKey("example.co.uk", (key) => keys.has(key))).toBe("co.uk");
    expect(findRdapBootstrapKey("example.org.uk", (key) => keys.has(key))).toBe("uk");
  });
});
