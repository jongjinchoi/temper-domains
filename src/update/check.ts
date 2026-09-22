import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "../version.ts";
import { currentEntry, detectInstallation, type Installation } from "./installation.ts";
import { AUTOMATIC_TIMEOUT_MS, parseStableVersion } from "./policy.ts";
import { fetchLatestVersion, type ReleaseChannel } from "./versions.ts";

export interface UpdateCheck {
  installation: Installation;
  current: string;
  latest: string | null;
  lockDirectory: string;
}
interface CheckOptions {
  lockDirectory?: string;
  entry?: string;
  current?: string;
  onFailure?: (error: unknown) => void;
  automaticTimeout?: number;
  manualTimeout?: number;
  detect?: (signal: AbortSignal) => Promise<Installation>;
  latest?: (channel: ReleaseChannel, signal: AbortSignal) => Promise<string>;
}

export async function checkForUpdate(automatic: boolean, options: CheckOptions = {}): Promise<UpdateCheck | null> {
  const controller = new AbortController();
  const { signal } = controller;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Update check timed out")); }, automatic ? options.automaticTimeout ?? AUTOMATIC_TIMEOUT_MS : options.manualTimeout ?? 10_000);
  });
  const lockDirectory = options.lockDirectory ?? join(homedir(), ".temper", "cache");
  const work = async (): Promise<UpdateCheck> => {
    const entry = options.entry ?? await currentEntry();
    const current = options.current ?? VERSION;
    if (!parseStableVersion(current)) throw new Error("Development/prerelease builds do not support stable update checks");
    signal.throwIfAborted();
    const installation = await (options.detect ? options.detect(signal) : detectInstallation({ entry, signal }));
    signal.throwIfAborted();
    let latest: string | null = null;
    if (installation.channel) {
      latest = await (options.latest ?? fetchLatestVersion)(installation.channel, signal);
      if (!parseStableVersion(latest)) throw new Error("No valid stable update version was returned");
    }
    signal.throwIfAborted();
    return { installation, current, latest, lockDirectory };
  };
  try { return await Promise.race([work(), timeout]); }
  catch (error) {
    if (automatic) {
      options.onFailure?.(error);
      return null;
    }
    throw error;
  } finally { clearTimeout(timer!); controller.abort(); }
}
