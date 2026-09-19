// Limits are client policy, not registry-advertised quotas. State is process-local.
export interface RequestScope { concurrency: number; active: number }
interface Job { scope: RequestScope; signal?: AbortSignal; start: () => void }
interface ServerQueue { active: number; nextStart: number; blockedUntil: number; jobs: Job[] }
export const SERVER_INTERVAL_MS = 300;
export function serverKey(url: string): string { return new URL(url).origin; }

export class RequestScheduler {
  private servers = new Map<string, ServerQueue>();
  private active = 0;
  private abortGroups = new Map<AbortSignal, { callbacks: Set<() => void>; listener: () => void }>();
  private cursor = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private concurrency = 20, private intervalMs = SERVER_INTERVAL_MS, private perServer = 2) {}

  private server(key: string): ServerQueue {
    let state = this.servers.get(key);
    if (!state) {
      state = { active: 0, nextStart: 0, blockedUntil: 0, jobs: [] };
      this.servers.set(key, state);
    }
    return state;
  }

  backoff(key: string, delayMs: number): void {
    const state = this.server(key);
    state.blockedUntil = Math.max(state.blockedUntil, Date.now() + delayMs);
    this.pump();
  }

  estimateWait(keys: readonly string[]): number {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    let wait = 0;
    for (const [key, count] of counts) {
      const state = this.servers.get(key);
      wait = Math.max(wait, Math.max(0, Math.max(state?.nextStart ?? 0, state?.blockedUntil ?? 0) - Date.now())
        + ((state?.jobs.length ?? 0) + count - 1) * this.intervalMs);
    }
    return wait;
  }

  private subscribeAbort(signal: AbortSignal | undefined, callback: () => void): () => void {
    if (!signal) return () => {};
    let group = this.abortGroups.get(signal);
    if (!group) {
      const callbacks = new Set<() => void>();
      const listener = () => { for (const abort of [...callbacks]) abort(); };
      group = { callbacks, listener };
      this.abortGroups.set(signal, group);
      signal.addEventListener("abort", listener, { once: true });
    }
    group.callbacks.add(callback);
    return () => {
      group.callbacks.delete(callback);
      if (!group.callbacks.size) {
        signal.removeEventListener("abort", group.listener);
        this.abortGroups.delete(signal);
      }
    };
  }

  run<T>(key: string, scope: RequestScope, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const state = this.server(key);
      const abort = () => {
        detach();
        const index = state.jobs.indexOf(job);
        if (index !== -1) state.jobs.splice(index, 1);
        reject(signal?.reason);
        this.pump();
      };
      const job: Job = { scope, signal, start: () => {
        detach();
        this.active++; state.active++; scope.active++;
        state.nextStart = Date.now() + this.intervalMs;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => {
          this.active--; state.active--; scope.active--;
          this.pump();
        });
      }};
      const detach = this.subscribeAbort(signal, abort);
      state.jobs.push(job);
      this.pump();
    });
  }

  private pump(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const states = [...this.servers.values()];
    let wait = Infinity;
    let scanned = 0;
    while (this.active < this.concurrency && scanned < states.length) {
      const state = states[this.cursor % states.length]!;
      this.cursor = (this.cursor + 1) % states.length;
      scanned++;
      if (state.active >= this.perServer) continue;
      const index = state.jobs.findIndex(job => job.scope.active < job.scope.concurrency);
      if (index < 0) continue;
      const delay = Math.max(state.nextStart, state.blockedUntil) - Date.now();
      if (delay > 0) { wait = Math.min(wait, delay); continue; }
      state.jobs.splice(index, 1)[0]!.start();
      scanned = 0;
    }
    // Never truncate a long cooldown into an early dispatch (Node timers cap at 2^31-1).
    if (Number.isFinite(wait) && this.active < this.concurrency) {
      this.timer = setTimeout(() => this.pump(), Math.min(wait, 2_147_483_647));
    }
    const now = Date.now();
    for (const [key, state] of this.servers) {
      if (!state.active && !state.jobs.length && Math.max(state.nextStart, state.blockedUntil) <= now) this.servers.delete(key);
    }
  }
}

export const requestScheduler = new RequestScheduler();
export const createRequestScope = (concurrency = 20): RequestScope => ({ concurrency: Math.max(1, concurrency), active: 0 });
