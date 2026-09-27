export type StoragePhase = "lock-write" | "open" | "write" | "sync" | "close" | "rename"
  | "file-close" | "temporary-unlink" | "lock-close" | "lock-unlink";
export interface StorageFailure { phase: StoragePhase; error: unknown }

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Supplemental diagnostics keep the caller's error identity and message intact.
export class FileTransactionError extends AggregateError {
  readonly lockCleanupFailed: boolean;
  constructor(readonly subject: string, readonly failures: readonly StorageFailure[], readonly committed: boolean,
    readonly lockPath: string, readonly kind: "primary" | "supplemental" = "primary", previousCause?: unknown) {
    const lockFailed = failures.some(failure => failure.phase === "lock-unlink");
    const outcome = kind === "supplemental" ? `cleanup failed ${committed ? "after saving" : "before saving"}`
      : committed ? "was saved, but cleanup failed" : "was not saved";
    const guidance = lockFailed ? `. After confirming no temper command is running, remove only ${lockPath} before the next attempt.` : "";
    super(failures.map(failure => failure.error), `${subject} ${outcome}: ${failures.map(failure => message(failure.error)).join("; ")}${guidance}`,
      { cause: kind === "supplemental" ? previousCause : failures[0]?.error });
    this.name = "FileTransactionError";
    this.lockCleanupFailed = lockFailed;
  }
}

// Only our supplemental diagnostics are user-facing; unrelated causes remain
// available for inspection without leaking stacks or repeating primary errors.
export function formatStorageError(error: unknown): string {
  const parts = [message(error)];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!(value instanceof Error) || seen.has(value)) return;
    seen.add(value);
    if (value !== error && value instanceof FileTransactionError && value.kind === "supplemental") parts.push(value.message);
    visit(value.cause);
    if (value instanceof AggregateError) for (const child of value.errors) visit(child);
  };
  visit(error);
  return parts.join(" ");
}
