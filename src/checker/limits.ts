import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { RetryAtSource } from "./types.ts";

export interface Lease { id: string; pid: number; expires: number; generation: number; probe: boolean }
export interface ServerLimit {
  generation: number; observedAt: number; strikes: number; blockedUntil: number; nextStart: number;
  source: RetryAtSource; kind: "rate_limited" | "service_unavailable";
  leases: Lease[];
}
export interface LimitState { version: 1; servers: Record<string, ServerLimit> }
export interface LimitStore { update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> }
export class MemoryLimitStore implements LimitStore {
  private state: LimitState = { version: 1, servers: {} };
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

function alive(pid: number): boolean {
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

// Storage owns atomicity. The coordinator owns policy, shared request slots and probes.
export class LimitCoordinator {
  constructor(private store: LimitStore, private now = Date.now, private random = Math.random) {}

  async acquire(key: string, deadline: number, signal: AbortSignal): Promise<LimitPermit> {
    while (true) {
      signal.throwIfAborted();
      const answer = await this.store.update(state => {
        const now = this.now();
        const entry = state.servers[key] ??= {
          generation: 0, observedAt: 0, strikes: 0, blockedUntil: 0, nextStart: 0,
          source: "client_policy", kind: "rate_limited", leases: [],
        };
        entry.leases = entry.leases.filter(l => l.expires > now && alive(l.pid));
        if (entry.blockedUntil > now) {
          if (entry.blockedUntil >= deadline) throw new ServerCooldown(entry.blockedUntil, entry.source, entry.kind);
          return { wait: Math.min(entry.blockedUntil - now, 100) };
        }
        const probe = entry.strikes > 0;
        if (entry.leases.length >= (probe ? 1 : 2)) return { wait: 100 };
        if (now >= deadline) { signal.throwIfAborted(); throw new DOMException("Lookup deadline reached before dispatch", "TimeoutError"); }
        const lease: Lease = { id: randomUUID(), pid: process.pid, expires: Math.ceil(deadline), generation: entry.generation, probe };
        entry.leases.push(lease);
        return { lease };
      }, signal);
      if (answer.lease) return this.permit(key, answer.lease, signal);
      await delay(answer.wait, undefined, { signal });
    }
  }

  private permit(key: string, lease: Lease, signal: AbortSignal): LimitPermit {
    return {
      check: async () => {
        while (true) {
          signal.throwIfAborted();
          const wait = await this.store.update(state => {
            const entry = state.servers[key]!;
            const now = this.now();
            if (entry.blockedUntil > now || entry.generation !== lease.generation) throw new ServerCooldown(entry.blockedUntil, entry.source, entry.kind);
            if (now >= lease.expires) throw new DOMException("Lookup deadline reached before dispatch", "TimeoutError");
            if (entry.nextStart > now) return Math.min(entry.nextStart - now, 100);
            entry.nextStart = now + 300;
            return 0;
          }, signal);
          if (!wait) return;
          await delay(wait, undefined, { signal });
        }
      },
      limited: (kind, serverDelay) => this.store.update(state => {
        const entry = state.servers[key]!;
        const now = this.now();
        // Concurrent replies from the previous generation must not multiply backoff.
        const first = entry.generation === lease.generation;
        if (first) { entry.generation++; entry.strikes = Math.min(5, entry.strikes + 1); }
        entry.observedAt = now;
        const source = serverDelay === undefined ? "client_policy" : "server";
        const candidate = serverDelay === undefined
          ? first ? now + Math.min(900000, 60000 * 2 ** (entry.strikes - 1)) + Math.floor(this.random() * 5001) : entry.blockedUntil
          : Math.min(8.64e15, now + serverDelay);
        if (candidate > entry.blockedUntil || (first && candidate === entry.blockedUntil)) {
          entry.blockedUntil = candidate; entry.source = source; entry.kind = kind;
        }
        return { retryAt: new Date(entry.blockedUntil).toISOString(), retryAtSource: entry.source };
      }),
      answered: () => this.store.update(state => {
        const entry = state.servers[key]!;
        // A late success must never erase a newer server-directed cooldown.
        if (entry.generation === lease.generation) { entry.strikes = 0; entry.blockedUntil = 0; }
      }),
      release: () => this.store.update(state => {
        const entry = state.servers[key];
        if (entry) entry.leases = entry.leases.filter(l => l.id !== lease.id);
      }),
    };
  }
}
export const memoryLimits = new LimitCoordinator(new MemoryLimitStore());
