export type UpdateCheckStage = "entry" | "installation" | "version";
type FailureKind = "failed" | "timeout" | "http" | "invalid_response" | "unsupported_build";

const labels: Record<UpdateCheckStage, string> = {
  entry: "Executable location", installation: "Installation", version: "Published version",
};

function systemCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object") return;
  const code = "code" in cause ? cause.code : undefined;
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,47}$/.test(code)) return code;
  const nested = "cause" in cause ? cause.cause : undefined;
  if (nested && typeof nested === "object" && "code" in nested && typeof nested.code === "string" && /^[A-Z][A-Z0-9_]{0,47}$/.test(nested.code)) return nested.code;
}

export class UpdateCheckError extends Error {
  readonly httpStatus?: number;
  constructor(readonly stage: UpdateCheckStage, readonly kind: FailureKind,
    options: { cause?: unknown; httpStatus?: number } = {}) {
    const code = systemCode(options.cause);
    const label = labels[stage];
    const message = kind === "timeout" ? `Update check timed out while checking the ${label.toLowerCase()}.` :
      kind === "http" ? `Published version request failed (HTTP ${options.httpStatus}).` :
      kind === "invalid_response" ? "Invalid published version response." :
      kind === "unsupported_build" ? "Development/prerelease builds do not support stable update checks." :
      `${label} check failed${code ? ` (${code})` : ""}.`;
    super(message, { cause: options.cause });
    this.name = "UpdateCheckError";
    this.httpStatus = options.httpStatus;
  }
}

export function updateCheckFailureMessage(error: unknown): string {
  // Remote bodies, arbitrary exception messages and terminal escapes are not UI text.
  return error instanceof UpdateCheckError ? error.message : "Update check failed.";
}
