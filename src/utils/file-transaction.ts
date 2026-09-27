import { open, rename, unlink, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export class FileTransactionError extends AggregateError {
  constructor(errors: unknown[], public readonly committed: boolean, public readonly lockCleanupFailed: boolean) {
    const reason = errors.map(error => error instanceof Error ? error.message : String(error)).join("; ");
    super(errors, `${committed ? "Data was saved, but cleanup failed" : "Data was not saved"}: ${reason}`, { cause: errors[0] });
    this.name = "FileTransactionError";
  }
}

interface TransactionOptions {
  deadline: number;
  signal?: AbortSignal;
  busyMessage: string;
}
interface FileTransaction { replace(text: string): Promise<void> }

// The caller owns validation and the entire read/modify operation inside change.
// Cancellation is checked before admission; a committed result is never discarded.
export async function withFileTransaction<T>(path: string, options: TransactionOptions,
  change: (transaction: FileTransaction) => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  let lock: FileHandle;
  while (true) {
    options.signal?.throwIfAborted();
    if (Date.now() >= options.deadline) throw new Error(options.busyMessage);
    try { lock = await open(lockPath, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await delay(Math.min(25, Math.max(0, options.deadline - Date.now())), undefined, { signal: options.signal });
    }
  }
  let temporary: string | undefined;
  let file: FileHandle | undefined;
  let committed = false;
  let lockCleanupFailed = false;
  const errors: unknown[] = [];
  let result: T | undefined;
  try {
    await lock.writeFile(`${process.pid}\n`);
    options.signal?.throwIfAborted();
    result = await change({ replace: async text => {
      if (temporary) throw new Error("A file transaction can replace its target only once");
      const candidate = `${path}.${randomUUID()}.tmp`;
      file = await open(candidate, "wx", 0o600);
      temporary = candidate;
      await file.writeFile(text, "utf8");
      await file.sync();
      await file.close();
      file = undefined;
      await rename(temporary, path);
      committed = true;
    } });
  } catch (error) { errors.push(error); }
  finally {
    if (file) await file.close().catch(error => { errors.push(error); });
    if (temporary) await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") errors.push(error);
    });
    await lock.close().catch(error => { errors.push(error); });
    await unlink(lockPath).catch(error => { lockCleanupFailed = true; errors.push(error); });
  }
  if (errors.length) throw new FileTransactionError(errors, committed, lockCleanupFailed);
  return result as T;
}
