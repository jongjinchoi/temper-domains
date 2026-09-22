import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { runProcess, type Invocation } from "./process.ts";

// script gives the installer a real terminal while we reduce only known routine
// output. Do not pipe the package manager itself: Homebrew would skip questions.
export function terminalCommand(command: Invocation, platform: "darwin" | "linux"): Invocation {
  if (platform === "darwin") return { file: "/usr/bin/script", args: ["-q", "/dev/null", command.file, ...command.args] };
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return { file: "/usr/bin/script", args: ["-q", "-e", "-f", "-c", `exec ${[command.file, ...command.args].map(quote).join(" ")}`, "/dev/null"] };
}

function routine(line: string): boolean {
  const text = stripVTControlCharacters(line).trim();
  // Unknown output, questions and diagnostics always remain visible.
  if (/warn|error|fail|password|proceed|continue|\?|sudo|pinned/i.test(text)) return false;
  return text === "==> Cleanup"
    || /^Removing: \/.+\.\.\. \([^\n]+\)$/.test(text)
    || /^==> (Fetching downloads for: |Upgrading |Upgraded \d+ requested outdated package)/.test(text)
    || /^jongjinchoi\/temper-domains\/temper \d+\.\d+\.\d+ (?:->|→) \d+\.\d+\.\d+$/.test(text)
    || /^\d+\.\d+\.\d+ (?:->|→) \d+\.\d+\.\d+$/.test(text);
}

export class InstallerOutput {
  private pending = "";
  private partial = false;
  private progress = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private status: string, private output: (text: string) => void) { this.draw(); }
  private clear() { if (this.progress) { this.output("\r\x1b[2K"); this.progress = false; } }
  private draw() { if (!this.partial && !this.progress) { this.output(this.status); this.progress = true; } }
  write(chunk: string) {
    clearTimeout(this.timer);
    this.pending += chunk;
    let newline: number;
    while ((newline = this.pending.indexOf("\n")) !== -1) {
      const line = this.pending.slice(0, newline + 1);
      this.pending = this.pending.slice(newline + 1);
      if (this.partial || !routine(line)) { this.clear(); this.output(line); }
      this.partial = false;
    }
    if (this.pending.length > 8192) this.flushPartial();
    // Questions need not end in a newline. Never hold them until child exit.
    if (this.pending) this.timer = setTimeout(() => this.flushPartial(), 30);
    else this.draw();
  }
  private flushPartial() {
    if (!this.pending) return;
    this.clear(); this.output(this.pending); this.pending = ""; this.partial = true;
  }
  finish() {
    clearTimeout(this.timer);
    this.flushPartial(); this.clear();
    if (this.partial) this.output("\n");
  }
}

export async function runInstaller(command: Invocation, status: string): Promise<void> {
  const platform = process.platform;
  const terminal = process.stdin.isTTY && process.stdout.isTTY;
  const available = terminal && (platform === "darwin" || platform === "linux")
    && await access("/usr/bin/script", constants.X_OK).then(() => true, () => false);
  if (!available) {
    // Windows and systems without script retain direct terminal ownership and
    // the package manager's quiet options, rather than losing input/consent.
    if (terminal) console.log(status);
    await runProcess(command, { inherit: true });
    return;
  }
  // Ink removes its readable listener; stop the underlying stream too so it
  // cannot consume bytes intended for script while the outer terminal is raw.
  process.stdin.pause();
  const view = new InstallerOutput(status.slice(0, Math.max(1, (process.stdout.columns || 80) - 1)), text => process.stdout.write(text));
  try {
    await runProcess(terminalCommand(command, platform as "darwin" | "linux"), {
      inherit: true, onOutput: text => view.write(text),
      env: { ...process.env, SHELL: "/bin/sh", HOMEBREW_NO_ENV_HINTS: "1" },
    });
  } finally { view.finish(); }
}
