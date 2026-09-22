import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "../version.ts";
import { cacheDecision, loadUpdateCache, saveUpdateCache, type UpdateCache } from "./cache.ts";
import { currentEntry, detectInstallation, type Installation } from "./installation.ts";
import { AUTOMATIC_TIMEOUT_MS, parseStableVersion } from "./policy.ts";
import { fetchLatestVersion, type ReleaseChannel } from "./versions.ts";

export interface UpdateCheck {
  installation: Installation;
  current: string;
  latest: string | null;
  cacheFile: string;
  cache: UpdateCache;
  now: () => number;
}
interface CheckOptions {
  cacheFile?: string;
  entry?: string;
  current?: string;
  now?: () => number;
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
  const cacheFile = options.cacheFile ?? join(homedir(), ".temper", "cache", "update.json");
  const now = options.now ?? Date.now;
  let cache: UpdateCache | undefined;
  const work = async (): Promise<UpdateCheck | null> => {
    const entry = options.entry ?? await currentEntry();
    const current = options.current ?? VERSION;
    if (!parseStableVersion(current)) throw new Error("Development/prerelease builds do not support stable update checks");
    const key = createHash("sha256").update(JSON.stringify([entry, current, process.execPath, process.env.PATH, process.env.npm_config_prefix, process.env.NPM_CONFIG_PREFIX])).digest("hex");
    const stored = await loadUpdateCache(cacheFile);
    cache = stored?.key === key ? stored : { schema: 1, key, identity: null, channel: null, latest: null, checkedAt: 0, attemptedAt: 0, postponedAt: 0, failed: false };
    const decision = automatic ? cacheDecision(cache, key, now()) : "check";
    if (decision === "skip") return null;
    // Persist the backoff before work starts so a timeout cannot race the next launch.
    if (automatic) await saveUpdateCache(cacheFile, { ...cache, attemptedAt: now(), failed: true });
    signal.throwIfAborted();
    const installation = await (options.detect ? options.detect(signal) : detectInstallation({ entry, signal }));
    signal.throwIfAborted();
    const reuse = decision === "cached" && cache.identity === installation.identity && cache.channel === (installation.channel ?? null);
    let latest: string | null = null;
    if (installation.channel) {
      latest = reuse ? cache.latest : await (options.latest ?? fetchLatestVersion)(installation.channel, signal);
      if (!parseStableVersion(latest)) throw new Error("No valid stable update version was returned");
    }
    signal.throwIfAborted();
    cache = { ...cache, identity: installation.identity, channel: installation.channel ?? null, latest, attemptedAt: now(), checkedAt: reuse ? cache.checkedAt : now(), failed: false };
    await saveUpdateCache(cacheFile, cache);
    return { installation, current, latest, cacheFile, cache, now };
  };
  try { return await Promise.race([work(), timeout]); }
  catch (error) {
    if (automatic) {
      return null;
    }
    throw error;
  } finally { clearTimeout(timer!); controller.abort(); }
}

export async function postponeUpdate(result: UpdateCheck): Promise<void> {
  await saveUpdateCache(result.cacheFile, { ...result.cache, postponedAt: result.now() });
}
