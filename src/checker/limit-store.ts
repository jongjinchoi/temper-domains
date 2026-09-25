import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { LimitCoordinator, LimitStateError, ServerCooldown, processAlive, type LimitState, type LimitStore } from "./limits.ts";

const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function validateState(value: unknown, version: 1 | 2): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Omit<LimitState, "version"> & { version: unknown };
  if (data.version !== version || !data.servers || typeof data.servers !== "object" || Array.isArray(data.servers)) return false;
  return Object.entries(data.servers).every(([key, s]) => {
    if (!/^(https?:\/\/|whois:\/\/)/.test(key) || !s || typeof s !== "object") return false;
    return (version === 1 || (typeof s.recovery === "boolean" && integer(s.level) && s.level <= 5 && integer(s.successes)
      && (s.stableSince === undefined || integer(s.stableSince))))
      && [s.generation, s.observedAt, s.strikes, s.blockedUntil, s.nextStart].every(integer) && s.strikes <= 5
      && ["server", "client_policy"].includes(s.source) && ["rate_limited", "service_unavailable"].includes(s.kind)
      && Array.isArray(s.leases) && s.leases.every(l => l && typeof l.id === "string" && integer(l.pid) && l.pid > 0
        && integer(l.expires) && integer(l.generation) && typeof l.probe === "boolean");
  });
}
export function validateLimitState(value: unknown): value is LimitState { return validateState(value, 2); }

export class FileLimitStore implements LimitStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly path: string) {}
  update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> {
    const deadline = Date.now() + 2000;
    const next = this.pending.then(() => this.transaction(change, deadline, signal));
    this.pending = next.catch(() => {});
    // Do not discard a committed lease on an abort during the atomic write.
    // The caller must receive it and release it before leaving the request.
    return next;
  }
  private async transaction<T>(change: (state: LimitState) => T, deadline: number, signal?: AbortSignal): Promise<T> {
    const lockPath = `${this.path}.lock`;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    let temporary: string | undefined;
    try {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new Error("State coordination timed out before the transaction started; retry after other temper commands finish");
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      while (!lock) {
        signal?.throwIfAborted();
        try { lock = await open(lockPath, "wx", 0o600); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (Date.now() >= deadline) throw new Error(`State is busy. After confirming no temper process is running, remove only ${lockPath} and retry.`);
          await delay(25, undefined, { signal });
        }
      }
      await lock.writeFile(`${process.pid}\n`);
      const raw = await readFile(this.path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      const state: unknown = raw === null ? { version: 2, servers: {} } : JSON.parse(raw);
      const before = JSON.stringify(state);
      if (validateState(state, 1)) {
        const old = state as LimitState;
        if (Object.values(old.servers).some(s => s.leases.some(l => l.expires > Date.now() && processAlive(l.pid)))) {
          throw new Error("An older Temper request is active. Finish older Temper commands and reconnect updated MCP clients; preserve this state file.");
        }
        old.version = 2;
        for (const entry of Object.values(old.servers)) {
          entry.leases = []; entry.recovery = entry.strikes > 0; entry.level = entry.strikes > 0 ? 2 : 0;
          entry.successes = 0; delete entry.stableSince;
        }
      }
      if (!validateLimitState(state)) throw new Error("Unsupported or invalid state; use a compatible Temper version and reconnect MCP clients. Preserve the state file before repair.");
      signal?.throwIfAborted();
      let result: T | undefined;
      let policyError: ServerCooldown | DOMException | undefined;
      try { result = change(state); }
      catch (error) {
        if (error instanceof ServerCooldown || error instanceof DOMException) policyError = error;
        else throw error;
      }
      if (JSON.stringify(state) !== before) {
        temporary = `${this.path}.${randomUUID()}.tmp`;
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(state) + "\n"); await file.sync(); }
        finally { await file.close(); }
        await rename(temporary, this.path);
      }
      if (policyError) throw policyError;
      return result as T;
    } catch (error) {
      // Preserve policy rejections; only persistence failures become state errors.
      if (signal?.aborted) throw signal.reason;
      if (error instanceof ServerCooldown || error instanceof DOMException) throw error;
      throw new LimitStateError(`Lookup state unavailable (${this.path}): ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      try { if (temporary) await unlink(temporary).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw new LimitStateError(`Could not remove ${temporary}: ${e.message}`); }); }
      finally { if (lock) { try { await lock.close(); } finally { await unlink(lockPath); } } }
    }
  }
}
export const localLimits = new LimitCoordinator(new FileLimitStore(join(homedir(), ".temper", "state", "lookup-limits.json")));
