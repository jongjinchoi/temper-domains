import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { runProcess, type Invocation } from "./process.ts";
import { InstallerMessages } from "./installer-output.ts";
import { colorSegment, progressLabel, progressRows, SPINNER_FRAMES, type InstallerContext, type OutputContext, type Segment } from "./presentation.ts";

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
  private drawnWidths: number[] = [];
  constructor(private status: string, private output: (text: string) => void, private interactive = false,
    private context: OutputContext = { channel: "homebrew", stage: "installing" }, private columns = () => process.stdout.columns || 80) {
    this.draw();
    if (interactive) this.timer = setInterval(() => {
      if (!this.progress || this.partial) return;
      this.clear(); this.frame++; this.draw();
    }, 80);
  }
  private clear() {
    if (!this.progress) return;
    const rows = this.interactive ? this.drawnWidths.reduce((sum, width) => sum + Math.max(1, Math.ceil(width / Math.max(1, this.columns()))), 0) : 1;
    this.output("\r\x1b[2K" + "\x1b[1A\r\x1b[2K".repeat(Math.max(0, rows - 1)));
    this.progress = false;
  }
  private draw() {
    if (this.partial || this.progress) return;
    let text = this.status;
    if (this.interactive) {
      // Our progress labels contain only single-cell ASCII, arrow, ellipsis and
      // braille glyphs. Wrap before the last column to avoid terminal auto-wrap.
      const width = Math.max(1, this.columns() - 1);
      const lines: Segment[][] = [];
      for (const row of progressRows(text, SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length]!)) {
        let line: Segment[] = []; let used = 0;
        for (const segment of row) {
          let remaining = segment.text;
          while (remaining) {
            const part = remaining.slice(0, width - used);
            line.push({ ...segment, text: part }); used += part.length; remaining = remaining.slice(part.length);
            if (used === width) { lines.push(line); line = []; used = 0; }
          }
        }
        if (line.length || row.length === 0) lines.push(line);
      }
      this.drawnWidths = lines.map(line => line.reduce((sum, part) => sum + part.text.length, 0));
      text = lines.map(line => line.map(colorSegment).join("")).join("\r\n");
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
      }, this.context);
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

export async function runInstaller(command: Invocation, context: InstallerContext): Promise<void> {
  const status = progressLabel(context.stage, context.current, context.target);
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
  const view = new InstallerOutput(status, text => process.stdout.write(text), true, context);
  try {
    await runProcess(terminalCommand(command, platform as "darwin" | "linux"), {
      inherit: true, onOutput: (text, stream) => view.write(text, stream),
      env: { ...process.env, SHELL: "/bin/sh", HOMEBREW_NO_ENV_HINTS: "1", ...(context.channel === "homebrew" ? { TERM: "dumb" } : {}) },
    });
  } finally { view.finish(); }
}
