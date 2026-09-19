import { requestScheduler, serverKey, createRequestScope } from "./scheduler.ts";
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

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Rate-limited concurrency: max N concurrent + minimum interval between starts
export function pThrottle(
  concurrency: number,
  minIntervalMs: number,
  getAdditionalWaitMs?: () => number,
) {
  const limit = pLimit(concurrency);
  let nextStart = 0;

  return <T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    return limit(async () => {
      if (signal?.aborted) throw abortError();
      const now = Date.now();
      const additionalWait = getAdditionalWaitMs?.() ?? 0;
      const scheduledStart = Math.max(now, nextStart, now + additionalWait);
      nextStart = scheduledStart + minIntervalMs;
      const wait = Math.max(0, scheduledStart - now);
      if (wait > 0) {
        try {
          await sleep(wait, signal);
        } catch (error) {
          if (nextStart === scheduledStart + minIntervalMs) {
            nextStart = scheduledStart;
          }
          throw error;
        }
      }
      if (signal?.aborted) throw abortError();
      return fn();
    });
  };
}

export function applyServerBackoff(serverUrl: string, delayMs: number) {
  requestScheduler.backoff(serverKey(serverUrl), delayMs);
}
export function getServerLimit(serverUrl: string) {
  const scope = createRequestScope();
  return <T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> =>
    requestScheduler.run(serverKey(serverUrl), scope, fn, signal);
}
