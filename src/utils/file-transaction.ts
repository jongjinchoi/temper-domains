import { open, rename, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { beginCriticalSection, isShuttingDown } from "./shutdown.ts";
import { FileTransactionError, type StorageFailure, type StoragePhase } from "./storage-error.ts";
export { FileTransactionError } from "./storage-error.ts";

interface TransactionOptions {
  subject: string;
  deadline: number;
  signal?: AbortSignal;
  busyMessage: string;
}
interface FileTransaction { replace(text: string): Promise<void> }

// The caller owns validation and the entire read/modify operation inside change.
// Errors thrown by change keep their identity and message; cleanup errors are
// attached as their cause. Replacement I/O and cleanup failures become one
// FileTransactionError that records whether the new data was committed.
// Cancellation is checked only before change runs. A cleanup failure after
// commit is still reported as an error, so change's return value is not delivered.
export async function withFileTransaction<T>(path: string, options: TransactionOptions,
  change: (transaction: FileTransaction) => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  let lock: FileHandle;
  let endCritical: () => void;
  while (true) {
    options.signal?.throwIfAborted();
    if (isShuttingDown()) throw new Error(`${options.subject} was not changed: temper is shutting down`);
    if (Date.now() >= options.deadline) throw new Error(options.busyMessage);
    // Registered before the attempt: the lock can exist on disk before this
    // code learns that open succeeded, and a signal must not exit in between.
    endCritical = beginCriticalSection();
    try { lock = await open(lockPath, "wx", 0o600); break; }
    catch (error) {
      endCritical();
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await delay(Math.min(25, Math.max(0, options.deadline - Date.now())), undefined, { signal: options.signal });
    }
  }
  let temporary: string | undefined;
  let file: FileHandle | undefined;
  let committed = false;
  let primary: { kind: "storage"; failure: StorageFailure } | { kind: "caller"; error: unknown } | undefined;
  const cleanup: StorageFailure[] = [];
  // Scoped to this transaction so a nested transaction's rejection stays a
  // caller error. Even `throw undefined` is distinct from no failure.
  class ReplacementFailure {
    constructor(readonly failure: StorageFailure) {}
  }
  let result: T | undefined;
  try {
    try { await lock.writeFile(`${process.pid}\n`); }
    catch (error) { primary = { kind: "storage", failure: { phase: "lock-write", error } }; }
    if (!primary) try {
      options.signal?.throwIfAborted();
      result = await change({ replace: async text => {
        if (temporary) throw new Error("A file transaction can replace its target only once");
        let phase: StoragePhase = "open";
        try {
          const candidate = `${path}.${randomUUID()}.tmp`;
          file = await open(candidate, "wx", 0o600);
          temporary = candidate;
          phase = "write";
          await file.writeFile(text, "utf8");
          phase = "sync";
          await file.sync();
          phase = "close";
          await file.close();
          file = undefined;
          phase = "rename";
          await rename(temporary, path);
          committed = true;
        } catch (error) { throw new ReplacementFailure({ phase, error }); }
      } });
    } catch (error) {
      primary = error instanceof ReplacementFailure ? { kind: "storage", failure: error.failure } : { kind: "caller", error };
    }
  } finally {
    if (file) await file.close().catch(error => { cleanup.push({ phase: "file-close", error }); });
    if (temporary) await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") cleanup.push({ phase: "temporary-unlink", error });
    });
    await lock.close().catch(error => { cleanup.push({ phase: "lock-close", error }); });
    await unlink(lockPath).catch(error => { cleanup.push({ phase: "lock-unlink", error }); });
    endCritical();
  }
  if (primary?.kind === "caller") {
    const { error } = primary;
    if (cleanup.length && error instanceof Error) {
      error.cause = new FileTransactionError(options.subject, cleanup, committed, lockPath, "supplemental", error.cause);
    }
    throw error;
  }
  const failures = primary ? [primary.failure, ...cleanup] : cleanup;
  if (failures.length) throw new FileTransactionError(options.subject, failures, committed, lockPath);
  return result as T;
}
