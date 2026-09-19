import { createRequestScope, type RequestScope } from "./scheduler.ts";
import type { TerminationReason } from "./types.ts";

export interface LookupContext {
  scope: RequestScope;
  deadline: number;
  requestTimeoutMs: number;
}
export class LookupAbort extends Error {
  constructor(readonly reason: TerminationReason) { super(reason); }
}
export function abortReason(signal: AbortSignal, attempts: number): TerminationReason {
  if (signal.reason instanceof LookupAbort) {
    if (signal.reason.reason === "deadline" && attempts === 0) return "deadline_before_start";
    return signal.reason.reason;
  }
  return "cancelled";
}
export function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createRun(timeoutMs: number, external?: AbortSignal, concurrency = 20, requestTimeoutMs = 5000) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const abort = () => controller.abort(new LookupAbort("cancelled"));
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  const context: LookupContext = { scope: createRequestScope(concurrency), deadline: Date.now() + timeoutMs, requestTimeoutMs };
  let timer: ReturnType<typeof setTimeout>;
  const setBudget = (ms: number) => {
    context.deadline = Date.now() + Math.max(0, ms - (performance.now() - startedAt));
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new LookupAbort("deadline")), Math.max(0, context.deadline - Date.now()));
  };
  setBudget(timeoutMs);
  return { signal: controller.signal, context, startedAt, setBudget, close() {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
    controller.abort(new LookupAbort("cancelled"));
  }};
}
