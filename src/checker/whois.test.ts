import { test, expect, describe } from "bun:test";
import { detectStatus } from "./whois.ts";

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
});
