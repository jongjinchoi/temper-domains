export function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (queue.length > 0) queue.shift()!();
        });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rate-limited concurrency: max N concurrent + minimum interval between starts
export function pThrottle(
  concurrency: number,
  minIntervalMs: number,
  getAdditionalWaitMs?: () => number,
) {
  const limit = pLimit(concurrency);
  let nextStart = 0;

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return limit(async () => {
      const now = Date.now();
      const additionalWait = getAdditionalWaitMs?.() ?? 0;
      const scheduledStart = Math.max(now, nextStart, now + additionalWait);
      nextStart = scheduledStart + minIntervalMs;
      const wait = Math.max(0, scheduledStart - now);
      if (wait > 0) await sleep(wait);
      return fn();
    });
  };
}

// Per-server throttled limiters (keyed by RDAP server URL)
const serverLimiters = new Map<string, ReturnType<typeof pThrottle>>();
const serverBackoffUntil = new Map<string, number>();

export function applyServerBackoff(serverUrl: string, delayMs: number) {
  if (delayMs <= 0) return;
  const until = Date.now() + delayMs;
  const current = serverBackoffUntil.get(serverUrl) ?? 0;
  serverBackoffUntil.set(serverUrl, Math.max(current, until));
}

function getServerBackoffWait(serverUrl: string): number {
  return Math.max(0, (serverBackoffUntil.get(serverUrl) ?? 0) - Date.now());
}

export function getServerLimit(serverUrl: string) {
  let limiter = serverLimiters.get(serverUrl);
  if (!limiter) {
    // 2 concurrent requests, 300ms between starts, plus server-specific backoff after rate limits.
    limiter = pThrottle(2, 300, () => getServerBackoffWait(serverUrl));
    serverLimiters.set(serverUrl, limiter);
  }
  return limiter;
}
