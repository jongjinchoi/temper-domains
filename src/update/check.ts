import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "../version.ts";
import { currentEntry, detectInstallation, type Installation } from "./installation.ts";
import { AUTOMATIC_TIMEOUT_MS, parseStableVersion } from "./policy.ts";
import { fetchLatestVersion, type ReleaseChannel } from "./versions.ts";
import { UpdateCheckError, type UpdateCheckStage } from "./errors.ts";

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
  let stage: UpdateCheckStage = "entry";
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new UpdateCheckError(stage, "timeout");
      controller.abort(error); reject(error);
    }, automatic ? options.automaticTimeout ?? AUTOMATIC_TIMEOUT_MS : options.manualTimeout ?? 10_000);
  });
  const lockDirectory = options.lockDirectory ?? join(homedir(), ".temper", "cache");
  const work = async (): Promise<UpdateCheck> => {
    const entry = options.entry ?? await currentEntry();
    const current = options.current ?? VERSION;
    if (!parseStableVersion(current)) throw new UpdateCheckError(stage, "unsupported_build");
    signal.throwIfAborted();
    stage = "installation";
    const installation = await (options.detect ? options.detect(signal) : detectInstallation({ entry, signal }));
    signal.throwIfAborted();
    let latest: string | null = null;
    if (installation.channel) {
      stage = "version";
      latest = await (options.latest ?? fetchLatestVersion)(installation.channel, signal);
      if (!parseStableVersion(latest)) throw new UpdateCheckError(stage, "invalid_response");
    }
    signal.throwIfAborted();
    return { installation, current, latest, lockDirectory };
  };
  try { return await Promise.race([work(), timeout]); }
  catch (error) {
    const failure = signal.reason instanceof UpdateCheckError ? signal.reason :
      error instanceof UpdateCheckError ? error : new UpdateCheckError(stage, "failed", { cause: error });
    if (automatic) {
      options.onFailure?.(failure);
      return null;
    }
    throw failure;
  } finally { clearTimeout(timer!); controller.abort(); }
}
