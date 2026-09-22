import { expect, test } from "bun:test";
import { automaticUpdatesEnabled, compareStableVersions, parseStableVersion } from "./policy.ts";

test("only interactive lookup commands may check for updates", () => {
  for (const command of ["temper", "search", "suggest", "whois", "list"]) {
    expect(automaticUpdatesEnabled(command, undefined, true, true, {})).toBe(true);
    expect(automaticUpdatesEnabled(command, "json", true, true, {})).toBe(false);
    expect(automaticUpdatesEnabled(command, undefined, false, true, {})).toBe(false);
    expect(automaticUpdatesEnabled(command, undefined, true, false, {})).toBe(false);
    expect(automaticUpdatesEnabled(command, undefined, true, true, { CI: "true" })).toBe(false);
    expect(automaticUpdatesEnabled(command, undefined, true, true, { TEMPER_NO_UPDATE_CHECK: "1" })).toBe(false);
  }
  for (const command of ["mcp", "extensions", "help", "init", "history", "watch", "config", "update"]) {
    expect(automaticUpdatesEnabled(command, undefined, true, true, {})).toBe(false);
  }
});

test("stable version comparison is numeric and refuses unsafe or prerelease metadata", () => {
  expect(compareStableVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareStableVersions("2.0.0", "10.0.0")).toBe(-1);
  expect(compareStableVersions("1.0.0+build", "1.0.0")).toBe(0);
  for (const value of ["v1.0.0", "1.0.0-beta", "01.0.0", "1.0", "1.0.0;touch x", "99999999999999999.0.0"]) {
    expect(parseStableVersion(value)).toBeNull();
  }
});
