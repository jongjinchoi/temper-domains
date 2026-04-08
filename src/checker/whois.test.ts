import { test, expect, describe } from "bun:test";
import { detectStatus, parseWhoisRaw } from "./whois.ts";

describe("detectStatus", () => {
  test("returns 'taken' when Domain Name header present", () => {
    expect(detectStatus("Domain Name: example.com\nRegistrar: IANA")).toBe("taken");
  });

  test("returns 'taken' for case-insensitive Domain Name", () => {
    expect(detectStatus("domain name: EXAMPLE.COM")).toBe("taken");
  });

  test("returns 'available' for 'No match'", () => {
    expect(detectStatus("No match for domain \"example.com\"")).toBe("available");
  });

  test("returns 'available' for 'NOT FOUND'", () => {
    expect(detectStatus("NOT FOUND")).toBe("available");
  });

  test("returns 'available' for 'domain not found'", () => {
    expect(detectStatus("domain not found")).toBe("available");
  });

  test("returns 'available' for 'No Data Found'", () => {
    expect(detectStatus("No Data Found")).toBe("available");
  });

  test("returns 'available' for 'No entries found'", () => {
    expect(detectStatus("No entries found")).toBe("available");
  });

  test("returns 'available' for 'Status: free'", () => {
    expect(detectStatus("Status: free")).toBe("available");
  });

  test("returns 'rate_limited' for rate limit response", () => {
    expect(detectStatus("Rate limit exceeded\nPlease try again later")).toBe("rate_limited");
  });

  test("returns 'rate_limited' for quota exceeded", () => {
    expect(detectStatus("Quota exceeded for this IP")).toBe("rate_limited");
  });

  test("returns 'rate_limited' for too many queries", () => {
    expect(detectStatus("Too many queries from your IP")).toBe("rate_limited");
  });

  test("returns 'reserved' for reserved domain", () => {
    expect(detectStatus("This domain is reserved by the registry")).toBe("reserved");
  });

  test("returns 'premium' for premium domain", () => {
    expect(detectStatus("This is a premium domain name")).toBe("premium");
  });

  test("returns 'error' for unrecognized response", () => {
    expect(detectStatus("some random text with no patterns")).toBe("error");
  });

  test("returns 'error' for empty string", () => {
    expect(detectStatus("")).toBe("error");
  });

  test("returns 'available' for .so style response (Domain Name + does not exist)", () => {
    expect(detectStatus("Domain Name: localhoston.so\nThe queried object does not exist: No Object Found")).toBe("available");
  });

  test("returns 'available' for 'No Object Found'", () => {
    expect(detectStatus("No Object Found")).toBe("available");
  });
});

describe("parseWhoisRaw", () => {
  test("parses standard .com WHOIS response", () => {
    const raw = [
      "Domain Name: EXAMPLE.COM",
      "Registrar: RESERVED-Internet Assigned Numbers Authority",
      "Updated Date: 2024-08-14T07:01:38Z",
      "Creation Date: 1995-08-14T04:00:00Z",
      "Registry Expiry Date: 2025-08-13T04:00:00Z",
      "Domain Status: clientDeleteProhibited https://icann.org/epp#clientDeleteProhibited",
      "Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited",
      "Name Server: A.IANA-SERVERS.NET",
      "Name Server: B.IANA-SERVERS.NET",
      "DNSSEC: signedDelegation",
    ].join("\n");

    const result = parseWhoisRaw(raw);
    expect(result.registrar).toBe("RESERVED-Internet Assigned Numbers Authority");
    expect(result.createdDate).toContain("1995");
    expect(result.expiryDate).toContain("2025");
    expect(result.updatedDate).toContain("2024");
    expect(result.nameServers).toHaveLength(2);
    expect(result.nameServers).toContain("a.iana-servers.net");
    expect(result.nameServers).toContain("b.iana-servers.net");
    expect(result.dnssec).toBe(true);
    expect(result.statusCodes).toContain("clientDeleteProhibited");
    expect(result.statusCodes).toContain("clientTransferProhibited");
  });

  test("parses Registrant Organization", () => {
    const raw = [
      "Registrant Organization: REDACTED FOR PRIVACY",
      "Registrant Name: John Doe",
    ].join("\n");

    const result = parseWhoisRaw(raw);
    expect(result.registrant).toBe("REDACTED FOR PRIVACY");
  });

  test("parses Registrant Name when Organization is absent", () => {
    const raw = "Registrant Name: John Doe";
    const result = parseWhoisRaw(raw);
    expect(result.registrant).toBe("John Doe");
  });

  test("parses unsigned DNSSEC", () => {
    const raw = "DNSSEC: unsigned";
    const result = parseWhoisRaw(raw);
    expect(result.dnssec).toBe(false);
  });

  test("returns empty for unstructured response", () => {
    const result = parseWhoisRaw("Random text without colons or structure");
    expect(result.registrar).toBeUndefined();
    expect(result.nameServers).toBeUndefined();
    expect(result.expiryDate).toBeUndefined();
  });

  test("deduplicates name servers (case-insensitive)", () => {
    const raw = [
      "Name Server: NS1.EXAMPLE.COM",
      "Name Server: ns1.example.com",
      "Name Server: NS2.EXAMPLE.COM",
    ].join("\n");

    const result = parseWhoisRaw(raw);
    expect(result.nameServers).toHaveLength(2);
  });

  test("normalizes dates to ISO format", () => {
    const raw = "Creation Date: 2020-01-15T00:00:00Z";
    const result = parseWhoisRaw(raw);
    expect(result.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("strips URL from domain status codes", () => {
    const raw = "Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited";
    const result = parseWhoisRaw(raw);
    expect(result.statusCodes).toEqual(["clientTransferProhibited"]);
  });

  test("skips comment lines", () => {
    const raw = [
      "% This is a comment",
      "# This is also a comment",
      "Registrar: Cloudflare",
    ].join("\n");

    const result = parseWhoisRaw(raw);
    expect(result.registrar).toBe("Cloudflare");
  });

  test("parses Sponsoring Registrar key", () => {
    const raw = "Sponsoring Registrar: GoDaddy";
    const result = parseWhoisRaw(raw);
    expect(result.registrar).toBe("GoDaddy");
  });

  test("parses alternative expiry key (paid-till)", () => {
    const raw = "paid-till: 2026-03-15";
    const result = parseWhoisRaw(raw);
    expect(result.expiryDate).toBeDefined();
  });
});
