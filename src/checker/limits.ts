import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { RetryAtSource } from "./types.ts";

export interface Lease { id: string; pid: number; expires: number; generation: number; probe: boolean }
export interface ServerLimit {
  generation: number; observedAt: number; strikes: number; blockedUntil: number; nextStart: number;
  source: RetryAtSource; kind: "rate_limited" | "service_unavailable";
  leases: Lease[];
  recovery: boolean; level: number; successes: number; stableSince?: number;
}
export interface LimitState { version: 2; servers: Record<string, ServerLimit> }
export interface LimitStore { update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> }
export class MemoryLimitStore implements LimitStore {
  private state: LimitState = { version: 2, servers: {} };
  async update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> { signal?.throwIfAborted(); return change(this.state); }
}
export class LimitStateError extends Error {}
export class ServerCooldown extends Error {
  constructor(readonly until: number, readonly source: RetryAtSource, readonly kind: ServerLimit["kind"]) {
    super("Previous server limit: this request was not sent");
  }
}
export interface LimitPermit {
  check(): Promise<void>;
  limited(kind: ServerLimit["kind"], serverDelay?: number): Promise<{ retryAt: string; retryAtSource: RetryAtSource }>;
  answered(): Promise<void>;
  release(): Promise<void>;
}

export function processAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

// Conservative client policy, not registry-advertised quotas.
const PACING_MS = [300, 600, 1200, 2400, 4800, 9600] as const;
export type Admission = { permit: LimitPermit; wait?: never } | { wait: number; permit?: never };

// Storage owns atomicity. The coordinator owns policy, shared request slots and probes.
export class LimitCoordinator {
  constructor(private store: LimitStore, private now = Date.now, private random = Math.random) {}

  estimateWait(keys: readonly string[], signal?: AbortSignal): Promise<number> {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return this.store.update(state => {
      let wait = 0;
      for (const [key, count] of counts) {
        const entry = state.servers[key];
        wait = Math.max(wait, Math.max(0, Math.max(entry?.blockedUntil ?? 0, entry?.nextStart ?? 0) - this.now())
          + (count - 1) * PACING_MS[entry?.level ?? 0]!);
      }
      return wait;
    }, signal);
  }

  async acquire(key: string, deadline: number, signal: AbortSignal): Promise<LimitPermit> {
    while (true) {
      const answer = await this.tryAcquire(key, deadline, signal);
      if (answer.permit) return answer.permit;
      await delay(Math.min(answer.wait, 100), undefined, { signal });
    }
  }

  async tryAcquire(key: string, deadline: number, signal: AbortSignal): Promise<Admission> {
      signal.throwIfAborted();
      const answer = await this.store.update(state => {
        const now = this.now();
        const entry = state.servers[key] ??= {
          generation: 0, observedAt: 0, strikes: 0, blockedUntil: 0, nextStart: 0,
          source: "client_policy", kind: "rate_limited", leases: [],
          recovery: false, level: 0, successes: 0,
        };
        const live = entry.leases.filter(l => l.expires > now && processAlive(l.pid));
        if (entry.leases.some(l => l.generation === entry.generation && !live.includes(l))) {
          entry.successes = 0; delete entry.stableSince;
        }
        entry.leases = live;
        if (now >= deadline) throw new DOMException("Lookup deadline reached before dispatch", "TimeoutError");
        if (entry.blockedUntil > now) {
          if (entry.blockedUntil >= deadline) throw new ServerCooldown(entry.blockedUntil, entry.source, entry.kind);
          return { wait: entry.blockedUntil - now };
        }
        if (entry.nextStart > now) {
          if (entry.nextStart >= deadline) throw new DOMException("Lookup deadline reached before dispatch", "TimeoutError");
          return { wait: entry.nextStart - now };
        }
        const probe = entry.recovery;
        if (entry.leases.length >= (probe ? 1 : 2)) return { wait: 100 };
        const lease: Lease = { id: randomUUID(), pid: process.pid, expires: Math.ceil(deadline), generation: entry.generation, probe };
        entry.leases.push(lease);
        entry.nextStart = now + PACING_MS[entry.level]!;
        return { lease };
      }, signal);
      if (answer.lease) return { permit: this.permit(key, answer.lease, signal) };
      return { wait: answer.wait! };
  }

  private permit(key: string, lease: Lease, signal: AbortSignal): LimitPermit {
    let successful = false;
    return {
      check: async () => {
          signal.throwIfAborted();
          await this.store.update(state => {
            const entry = state.servers[key]!;
            const now = this.now();
            if (entry.blockedUntil > now || entry.generation !== lease.generation) throw new ServerCooldown(entry.blockedUntil, entry.source, entry.kind);
            if (now >= lease.expires) throw new DOMException("Lookup deadline reached before dispatch", "TimeoutError");
          }, signal);
      },
      limited: (kind, serverDelay) => this.store.update(state => {
        const entry = state.servers[key]!;
        const now = this.now();
        // Concurrent replies from the previous generation must not multiply backoff.
        const first = entry.generation === lease.generation;
        if (first) {
          entry.generation++; entry.strikes = Math.min(5, entry.strikes + 1);
          entry.recovery = true; entry.successes = 0; delete entry.stableSince;
          if (kind === "rate_limited") entry.level = Math.min(5, Math.max(2, entry.level + 1));
        }
        entry.observedAt = now;
        const source = serverDelay === undefined ? "client_policy" : "server";
        const candidate = serverDelay === undefined
          ? first ? now + Math.min(900000, 60000 * 2 ** (entry.strikes - 1)) + Math.floor(this.random() * 5001) : entry.blockedUntil
          : Math.min(8.64e15, now + serverDelay);
        if (candidate > entry.blockedUntil || (first && candidate === entry.blockedUntil)) {
          entry.blockedUntil = candidate; entry.source = source; entry.kind = kind;
        }
        entry.nextStart = Math.max(entry.nextStart, now + PACING_MS[entry.level]!);
        return { retryAt: new Date(entry.blockedUntil).toISOString(), retryAtSource: entry.source };
      }),
      answered: () => this.store.update(state => {
        const entry = state.servers[key]!;
        // A late success must never erase a newer server-directed cooldown.
        if (entry.generation !== lease.generation || this.now() >= lease.expires) return;
        successful = true;
        if (!entry.recovery) return;
        entry.stableSince ??= this.now(); entry.successes++;
        if (entry.successes >= 8 && this.now() - entry.stableSince >= 30000) {
          entry.level = Math.max(0, entry.level - 1); entry.successes = 0; entry.stableSince = this.now();
          if (entry.level === 0) { entry.recovery = false; entry.strikes = 0; }
        }
      }),
      release: () => this.store.update(state => {
        const entry = state.servers[key];
        if (entry) {
          if (!successful && entry.generation === lease.generation && entry.leases.some(l => l.id === lease.id)) {
            entry.successes = 0; delete entry.stableSince;
          }
          entry.leases = entry.leases.filter(l => l.id !== lease.id);
        }
      }),
    };
  }
}
export const memoryLimits = new LimitCoordinator(new MemoryLimitStore());
