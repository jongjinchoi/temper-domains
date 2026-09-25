import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { brewReadEnvironment, isWithin, type Installation, type Query } from "./installation.ts";
import { compareStableVersions, parseStableVersion } from "./policy.ts";
import { runProcess, withInstallLock, type Invocation } from "./process.ts";
import { FORMULA, parseBrewInfo } from "./versions.ts";
import type { InstallerContext } from "./presentation.ts";

export function updateCommands(installation: Installation, version: string): Invocation[] {
  if (!parseStableVersion(version)) throw new Error("Invalid update target version");
  if (installation.kind === "npm") return [{ file: installation.npm.file, args: [...installation.npm.args, "install", "--global", "--prefix", installation.prefix, `temper-domains@${version}`, "--loglevel=warn", "--no-progress"] }];
  if (installation.kind === "homebrew") return [{ file: installation.brew, args: ["update", "--quiet"] }, { file: installation.brew, args: ["upgrade", "--formula", FORMULA, "--quiet"] }];
  return [];
}

export interface UpdateExecution {
  lockDirectory: string;
  query?: Query;
  execute?: (command: Invocation, context: InstallerContext) => Promise<void>;
  confirmTarget: (version: string) => Promise<boolean>;
  onStage?: (stage: UpdateStage) => Promise<void>;
}
export type UpdateStage = "refreshing" | "installing" | "verifying";
export type UpdateOutcome = { status: "updated" | "current"; version: string } | { status: "cancelled" };

export async function performUpdate(installation: Installation, target: string, options: UpdateExecution): Promise<UpdateOutcome> {
  if (installation.kind === "manual") throw new Error(installation.guidance);
  if (!parseStableVersion(target)) throw new Error("Invalid update target version");
  const query = options.query ?? runProcess;
  const execute = options.execute ?? (async command => { await runProcess(command, { inherit: true }); });
  const read = (command: Invocation) => query(command, { signal: AbortSignal.timeout(10_000), env: brewReadEnvironment() });
  const installedVersion = async () => {
    let command: Invocation;
    if (installation.kind === "npm") {
      if (await realpath(installation.entry) !== installation.entry || !isWithin(installation.entry, installation.root)) throw new Error("The npm installation changed; run temper update again");
      command = { file: installation.node, args: [installation.entry, "--version"] };
    } else {
      const result = await read({ file: installation.brew, args: ["--prefix", "--installed", FORMULA] });
      const keg = await realpath(result.stdout.trim());
      const entry = await realpath(join(keg, "bin", "temper"));
      if (!isWithin(keg, installation.rack) || !isWithin(entry, keg)) throw new Error("The Homebrew installation changed; run temper update again");
      command = { file: entry, args: ["--version"] };
    }
    const version = (await read(command)).stdout.trim();
    if (!parseStableVersion(version)) throw new Error("Installed version verification returned an invalid version");
    return version;
  };
  return withInstallLock(options.lockDirectory, installation.identity, async () => {
    let expected = target;
    const before = await installedVersion();
    if (compareStableVersions(before, expected) >= 0) return { status: "current", version: before };
    if (installation.kind === "homebrew") {
      const info = async () => parseBrewInfo((await read({ file: installation.brew, args: ["info", "--json=v2", "--formula", FORMULA] })).stdout);
      if ((await info()).pinned) throw new Error("Temper is pinned in Homebrew. The pin has not been changed.");
      await options.onStage?.("refreshing");
      await execute(updateCommands(installation, target)[0]!, { channel: "homebrew", stage: "refreshing", current: before, target });
      const refreshed = await info();
      if (refreshed.pinned) throw new Error("Temper is pinned in Homebrew. The pin has not been changed.");
      expected = refreshed.version;
      if (compareStableVersions(expected, before) <= 0) throw new Error("Homebrew metadata does not offer a newer version; no upgrade was started");
      if (expected !== target && !await options.confirmTarget(expected)) return { status: "cancelled" };
      await options.onStage?.("installing");
      await execute(updateCommands(installation, expected)[1]!, { channel: "homebrew", stage: "installing", current: before, target: expected });
    } else {
      await options.onStage?.("installing");
      await execute(updateCommands(installation, target)[0]!, { channel: "npm", stage: "installing", current: before, target });
    }
    await options.onStage?.("verifying");
    const after = await installedVersion();
    if (compareStableVersions(after, expected) !== 0) throw new Error(`Update verification failed: expected ${expected}, found ${after}. Check this installation before retrying.`);
    return { status: "updated", version: after };
  });
}
