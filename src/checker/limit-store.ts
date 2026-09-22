import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { LimitCoordinator, LimitStateError, ServerCooldown, type LimitState, type LimitStore } from "./limits.ts";

const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function validateLimitState(value: unknown): value is LimitState {
  if (!value || typeof value !== "object") return false;
  const data = value as LimitState;
  if (data.version !== 1 || !data.servers || typeof data.servers !== "object" || Array.isArray(data.servers)) return false;
  return Object.entries(data.servers).every(([key, s]) => {
    if (!/^(https?:\/\/|whois:\/\/)/.test(key) || !s || typeof s !== "object") return false;
    return [s.generation, s.observedAt, s.strikes, s.blockedUntil, s.nextStart].every(integer) && s.strikes <= 5
      && ["server", "client_policy"].includes(s.source) && ["rate_limited", "service_unavailable"].includes(s.kind)
      && Array.isArray(s.leases) && s.leases.every(l => l && typeof l.id === "string" && integer(l.pid) && l.pid > 0
        && integer(l.expires) && integer(l.generation) && typeof l.probe === "boolean");
  });
}

export class FileLimitStore implements LimitStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly path: string) {}
  update<T>(change: (state: LimitState) => T, signal?: AbortSignal): Promise<T> {
    const deadline = Date.now() + 2000;
    const next = this.pending.then(() => this.transaction(change, deadline, signal));
    this.pending = next.catch(() => {});
    if (!signal) return next;
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      next.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
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
      const state: unknown = raw === null ? { version: 1, servers: {} } : JSON.parse(raw);
      if (!validateLimitState(state)) throw new Error("Invalid structure; preserve and repair the state file before retrying");
      const before = JSON.stringify(state);
      signal?.throwIfAborted();
      const result = change(state);
      if (JSON.stringify(state) !== before) {
        temporary = `${this.path}.${randomUUID()}.tmp`;
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(state) + "\n"); await file.sync(); }
        finally { await file.close(); }
        await rename(temporary, this.path);
      }
      return result;
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
