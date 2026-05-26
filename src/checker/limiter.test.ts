import { test, expect, describe } from "bun:test";
import { applyServerBackoff, getServerLimit, pLimit, pThrottle } from "./limiter.ts";

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

  test("reserves start slots before waiting when concurrency is greater than 1", async () => {
    const throttle = pThrottle(2, 50);
    const timestamps: number[] = [];

    await Promise.all([
      throttle(async () => { timestamps.push(Date.now()); }),
      throttle(async () => { timestamps.push(Date.now()); }),
      throttle(async () => { timestamps.push(Date.now()); }),
    ]);

    expect(timestamps).toHaveLength(3);
    for (let i = 1; i < timestamps.length; i++) {
      const diff = (timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0);
      expect(diff).toBeGreaterThanOrEqual(40); // allow 10ms margin
    }
  });

  test("waits for additional backoff before starting the next task", async () => {
    let backoffUntil = 0;
    const throttle = pThrottle(1, 0, () => Math.max(0, backoffUntil - Date.now()));
    const timestamps: number[] = [];

    await throttle(async () => {
      timestamps.push(Date.now());
      backoffUntil = Date.now() + 80;
    });
    await throttle(async () => { timestamps.push(Date.now()); });

    const diff = (timestamps[1] ?? 0) - (timestamps[0] ?? 0);
    expect(diff).toBeGreaterThanOrEqual(70); // allow 10ms margin
  });

  test("preserves start spacing after additional backoff when concurrency is greater than 1", async () => {
    const backoffUntil = Date.now() + 80;
    const throttle = pThrottle(2, 50, () => Math.max(0, backoffUntil - Date.now()));
    const timestamps: number[] = [];

    await Promise.all([
      throttle(async () => { timestamps.push(Date.now()); }),
      throttle(async () => { timestamps.push(Date.now()); }),
    ]);

    const diff = (timestamps[1] ?? 0) - (timestamps[0] ?? 0);
    expect(diff).toBeGreaterThanOrEqual(40); // allow 10ms margin
  });
});

describe("getServerLimit", () => {
  test("applies server backoff to later tasks for the same RDAP server", async () => {
    const serverUrl = `https://rdap-backoff-${Date.now()}.test`;
    const limit = getServerLimit(serverUrl);
    const timestamps: number[] = [];

    await limit(async () => {
      timestamps.push(Date.now());
      applyServerBackoff(serverUrl, 500);
    });
    await limit(async () => { timestamps.push(Date.now()); });

    const diff = (timestamps[1] ?? 0) - (timestamps[0] ?? 0);
    expect(diff).toBeGreaterThanOrEqual(450); // allow 50ms margin
  });
});
