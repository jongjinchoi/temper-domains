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

// Rate-limited concurrency: max N concurrent + minimum interval between starts
export function pThrottle(concurrency: number, minIntervalMs: number) {
  const limit = pLimit(concurrency);
  let lastStart = 0;

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return limit(async () => {
      const now = Date.now();
      const wait = Math.max(0, minIntervalMs - (now - lastStart));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastStart = Date.now();
      return fn();
    });
  };
}

// Per-server throttled limiters (keyed by RDAP server URL)
const serverLimiters = new Map<string, ReturnType<typeof pThrottle>>();

export function getServerLimit(serverUrl: string) {
  let limiter = serverLimiters.get(serverUrl);
  if (!limiter) {
    limiter = pThrottle(2, 300); // 2 concurrent, 300ms between starts
    serverLimiters.set(serverUrl, limiter);
  }
  return limiter;
}
