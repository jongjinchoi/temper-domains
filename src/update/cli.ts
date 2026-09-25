import { loadConfig } from "../config/config.ts";
import { setTheme } from "../tui/theme.ts";
import { checkForUpdate, type UpdateCheck } from "./check.ts";
import { automaticUpdatesEnabled, compareStableVersions } from "./policy.ts";
import { displayInvocation } from "./process.ts";
import { performUpdate, updateCommands } from "./runner.ts";
import type { PromptOutcome } from "../tui/UpdatePrompt.tsx";

async function prompt(result: UpdateCheck): Promise<PromptOutcome> {
  const { render } = await import("ink");
  const { createElement } = await import("react");
  const { UpdatePrompt } = await import("../tui/UpdatePrompt.tsx");
  const installation = result.installation;
  const instance = render(createElement(UpdatePrompt, {
    current: result.current, latest: result.latest!,
    installer: installation.kind === "homebrew" ? "Homebrew" : "npm",
    guidance: installation.kind === "manual" ? installation.guidance : undefined,
    onUpdate: installation.kind === "manual" ? undefined : (execute, confirmTarget, onStage) => performUpdate(installation, result.latest!, { lockDirectory: result.lockDirectory, execute, confirmTarget, onStage }),
  }), { exitOnCtrlC: false });
  const outcome = await instance.waitUntilExit();
  instance.cleanup();
  if (!outcome || typeof outcome !== "object" || !("kind" in outcome)) return { kind: "cancelled" };
  return outcome as PromptOutcome;
}

function reportOutcome(outcome: PromptOutcome, command: string): void {
  if (outcome.kind === "updated" || outcome.kind === "current") {
    console.log("\n" + (command === "temper" || command === "update" ? "Run temper again." : "Run your original command again to use the installed version."));
  } else if (outcome.kind === "failed") {
    console.error(`Update failed: ${outcome.message}\nCheck the installation, then retry with temper update. No rollback has been assumed.`);
    process.exitCode = 1;
  } else if (outcome.kind === "cancelled") {
    console.error("Update cancelled."); process.exitCode = 130;
  }
}

// Returns true when the command must stop (updated, cancelled, or installer failed).
export async function maybeUpdate(command: string, format?: string): Promise<boolean> {
  if (!automaticUpdatesEnabled(command, format, Boolean(process.stdin.isTTY), Boolean(process.stdout.isTTY), process.env)) return false;
  const result = await checkForUpdate(true, { onFailure: () => console.error("Could not check for updates. Try temper update --check.") });
  if (!result?.latest || compareStableVersions(result.latest, result.current) <= 0) return false;
  const outcome = await prompt(result);
  if (outcome.kind === "later") return false;
  reportOutcome(outcome, command);
  return true;
}

export async function updateCommand(checkOnly: boolean): Promise<void> {
  if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.BUILD_NUMBER)) {
    throw new Error("Interactive updates require a terminal. Run temper update --check for version information and manual update instructions.");
  }
  if (!checkOnly) { const config = await loadConfig(); setTheme(config.theme); }
  const result = await checkForUpdate(false);
  if (!result) return;
  if (!result.latest) { console.log(result.installation.guidance); return; }
  const newer = compareStableVersions(result.latest, result.current) > 0;
  if (checkOnly || !newer) {
    console.log(`Installed: ${result.current}\nPublished (${result.installation.channel}): ${result.latest}\n${newer ? "Update available." : "No newer stable version is available."}`);
    if (result.installation.kind === "manual") console.log(result.installation.guidance);
    else if (newer) console.log(updateCommands(result.installation, result.latest).map(displayInvocation).join("\n"));
    return;
  }
  const outcome = await prompt(result);
  if (outcome.kind !== "later") reportOutcome(outcome, "update");
}
