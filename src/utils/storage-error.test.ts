import { expect, test } from "bun:test";
import { FileTransactionError, formatStorageError } from "./storage-error.ts";

test("supplemental cleanup appears once without changing the caller or displaying unrelated causes", () => {
  const originalCause = new Error("private parser details");
  const cleanup = new FileTransactionError("Watchlist", [{ phase: "lock-unlink", error: new Error("cannot unlink") }], false, "/test/watch.lock", "supplemental", originalCause);
  const caller = new RangeError("Invalid watchlist", { cause: cleanup });
  const wrapper = new AggregateError([caller, cleanup], "Invalid watchlist", { cause: caller });
  originalCause.cause = wrapper;
  const result = formatStorageError(wrapper);
  expect(result.match(/cannot unlink/g)).toHaveLength(1);
  expect(result.match(/remove only/g)).toHaveLength(1);
  expect(result).toContain("/test/watch.lock");
  expect(result).not.toContain("private parser details");
  expect(caller.message).toBe("Invalid watchlist");
  expect(caller.cause).toBe(cleanup);
  expect(cleanup.cause).toBe(originalCause);
});

test("direct and wrapped storage failures retain their existing complete message", () => {
  const error = new FileTransactionError("Config", [{ phase: "lock-close", error: new Error("close failed") }], true, "/test/config.lock");
  for (const value of [error, new Error(error.message, { cause: error })]) {
    const result = formatStorageError(value);
    expect(result).toBe("Config was saved, but cleanup failed: close failed");
    expect(result).not.toContain("remove only");
  }
  expect(formatStorageError(new Error("caller only"))).toBe("caller only");
  expect(formatStorageError(undefined)).toBe("undefined");
});
