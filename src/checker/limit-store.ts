import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { FileTransactionError, withFileTransaction } from "../utils/file-transaction.ts";
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
    try {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new Error("State coordination timed out before the transaction started; retry after other temper commands finish");
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      return await withFileTransaction(this.path, {
        deadline, signal,
        busyMessage: `State is busy. After confirming no temper process is running, remove only ${lockPath} and retry.`,
      }, async transaction => {
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
          await transaction.replace(JSON.stringify(state) + "\n");
        }
        if (policyError) throw policyError;
        return result as T;
      });
    } catch (error) {
      const primary = error instanceof FileTransactionError ? error.cause : error;
      // Policy/cancellation identity is part of the caller contract. Cleanup
      // diagnostics remain attached without turning an unsent request into I/O.
      if (primary instanceof ServerCooldown || primary instanceof DOMException || signal?.aborted) {
        const rejection = signal?.aborted ? signal.reason : primary;
        if (error instanceof FileTransactionError && error.errors.length > 1 && rejection instanceof Error) {
          rejection.cause = new AggregateError(error.errors.slice(1), "Lookup state cleanup failed");
        }
        throw rejection;
      }
      throw new LimitStateError(`Lookup state unavailable (${this.path}): ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}
export const localLimits = new LimitCoordinator(new FileLimitStore(join(homedir(), ".temper", "state", "lookup-limits.json")));
