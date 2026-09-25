import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { runProcess, type Invocation } from "./process.ts";
import { InstallerMessages } from "./installer-output.ts";
import { theme } from "../tui/theme.ts";

// script gives the installer a real terminal while we reduce only known routine
// output. Do not pipe the package manager itself: Homebrew would skip questions.
export function terminalCommand(command: Invocation, platform: "darwin" | "linux"): Invocation {
  if (platform === "darwin") return { file: "/usr/bin/script", args: ["-q", "/dev/null", command.file, ...command.args] };
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return { file: "/usr/bin/script", args: ["-q", "-e", "-f", "-c", `exec ${[command.file, ...command.args].map(quote).join(" ")}`, "/dev/null"] };
}

export class InstallerOutput {
  private partial = false;
  private partialStreams = new Set<string>();
  private lastStream: string | undefined;
  private progress = false;
  private streams = new Map<string, InstallerMessages>();
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private status: string, private output: (text: string) => void, private interactive = false) {
    this.draw();
    if (interactive) this.timer = setInterval(() => {
      if (!this.progress || this.partial) return;
      this.clear(); this.frame++; this.draw();
    }, 80);
  }
  private clear() {
    if (!this.progress) return;
    this.output(this.interactive ? "\r\x1b[2K\x1b[1A\r\x1b[2K" : "\r\x1b[2K"); this.progress = false;
  }
  private draw() {
    if (this.partial || this.progress) return;
    let text = this.status;
    if (this.interactive) {
      text = `${["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][this.frame % 10]} ${text}`;
      if (process.env.FORCE_COLOR !== "0" && (!process.env.NO_COLOR || Boolean(process.env.FORCE_COLOR))) {
        const color = [1, 3, 5].map(offset => parseInt(theme.primary.slice(offset, offset + 2), 16)).join(";");
        text = `\x1b[38;2;${color}m${text}\x1b[0m`;
      }
      text += "\r\nCtrl+C to cancel";
    }
    this.output(text); this.progress = true;
  }
  write(chunk: string, stream = "stdout") {
    let decoder = this.streams.get(stream);
    if (!decoder) {
      decoder = new InstallerMessages((text, partial) => {
        this.clear();
        if (this.lastStream && this.lastStream !== stream && this.partialStreams.has(this.lastStream)) this.output("\r\n");
        // script temporarily makes the outer terminal raw (including OPOST).
        this.output(text.replaceAll("\n", "\r\n"));
        if (partial) this.partialStreams.add(stream); else this.partialStreams.delete(stream);
        this.partial = this.partialStreams.size > 0;
        this.lastStream = stream;
      });
      this.streams.set(stream, decoder);
    }
    decoder.write(chunk);
    this.draw();
  }
  finish() {
    clearInterval(this.timer);
    for (const decoder of this.streams.values()) decoder.finish();
    this.clear();
  }
}

export async function runInstaller(command: Invocation, status: string, homebrew = false): Promise<void> {
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
  const view = new InstallerOutput(status.slice(0, Math.max(1, (process.stdout.columns || 80) - 3)), text => process.stdout.write(text), true);
  try {
    await runProcess(terminalCommand(command, platform as "darwin" | "linux"), {
      inherit: true, onOutput: (text, stream) => view.write(text, stream),
      env: { ...process.env, SHELL: "/bin/sh", HOMEBREW_NO_ENV_HINTS: "1", ...(homebrew ? { TERM: "dumb" } : {}) },
    });
  } finally { view.finish(); }
}
