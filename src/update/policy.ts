export const AUTOMATIC_TIMEOUT_MS = 2000;

export function automaticUpdatesEnabled(command: string, format: string | undefined, stdinTTY: boolean, stdoutTTY: boolean, env: NodeJS.ProcessEnv): boolean {
  return ["temper", "search", "suggest", "whois", "list"].includes(command) && format !== "json" &&
    stdinTTY && stdoutTTY && !env.CI && !env.CONTINUOUS_INTEGRATION && !env.BUILD_NUMBER &&
    env.TEMPER_NO_UPDATE_CHECK !== "1";
}

// Only stable, exact versions are installable; never pass tags or ranges from metadata.
export function parseStableVersion(value: unknown): number[] | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return null;
  const parts = value.split("+")[0]!.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function compareStableVersions(a: string, b: string): number {
  const left = parseStableVersion(a);
  const right = parseStableVersion(b);
  if (!left || !right) throw new Error("Cannot compare an invalid or prerelease version");
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! > right[i]! ? 1 : -1;
  }
  return 0;
}
