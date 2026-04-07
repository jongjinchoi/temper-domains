import { test, expect, describe } from "bun:test";
import { pLimit, pThrottle } from "./limiter.ts";

describe("pLimit", () => {
  test("executes all tasks", async () => {
    const limit = pLimit(2);
    const results: number[] = [];

    await Promise.all([
      limit(async () => { results.push(1); }),
      limit(async () => { results.push(2); }),
      limit(async () => { results.push(3); }),
    ]);

    expect(results).toHaveLength(3);
    expect(results).toContain(1);
    expect(results).toContain(2);
    expect(results).toContain(3);
  });

  test("limits concurrency", async () => {
    const limit = pLimit(2);
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, () =>
      limit(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
      })
    );

    await Promise.all(tasks);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  test("concurrency of 1 runs sequentially", async () => {
    const limit = pLimit(1);
    const order: number[] = [];

    await Promise.all([
      limit(async () => { await new Promise((r) => setTimeout(r, 30)); order.push(1); }),
      limit(async () => { await new Promise((r) => setTimeout(r, 10)); order.push(2); }),
      limit(async () => { order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});

describe("pThrottle", () => {
  test("enforces minimum interval between starts", async () => {
    const throttle = pThrottle(1, 100);
    const timestamps: number[] = [];

    await Promise.all([
      throttle(async () => { timestamps.push(Date.now()); }),
      throttle(async () => { timestamps.push(Date.now()); }),
      throttle(async () => { timestamps.push(Date.now()); }),
    ]);

    expect(timestamps).toHaveLength(3);
    for (let i = 1; i < timestamps.length; i++) {
      const diff = (timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0);
      expect(diff).toBeGreaterThanOrEqual(90); // allow 10ms margin
    }
  });
});
