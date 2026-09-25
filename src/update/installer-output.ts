// Homebrew 7.0.6 output formats. Anything outside these formats remains visible.
// In particular, a diagnostic must never be inferred to be routine from its prefix.
const diagnostic = /warn|error|fail|password|proceed|continue|\?|sudo|pinned|checksum|denied|✘/i;
const question = /(?:\?|password\s*:|\[[yYnN/]+\])\s*$/i;
const routinePrefixes = ["Removing: /", "==> ", "jongjinchoi/temper-domains/temper ", "✔︎ ", "✔ ", "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "Formula ", "Bottle ", "🍺 "];

function routine(line: string): boolean {
  const text = line.trim();
  if (diagnostic.test(text)) return false;
  return text === "==> Cleanup"
    || /^Removing: \/.+\.\.\. \([^\n]+\)$/.test(text)
    || /^==> (?:Fetching downloads for: .+|Upgrading .+|Installing [\w@+.-]+ from [\w.-]+\/[\w.-]+|(?:Would upgrade|Upgraded) \d+ requested outdated packages?|Pouring .+\.bottle\..+)$/.test(text)
    || /^(?:jongjinchoi\/temper-domains\/temper )?\d+\.\d+\.\d+ (?:->|→) \d+\.\d+\.\d+$/.test(text)
    || /^(?:✔︎? |[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] )?(?:Formula|Bottle(?: Manifest)?|Resource) [\w@+./-]+ \([\w.+-]+\)(?:\s+(?:[# ]*Downloading|Downloaded|Extracting|Extracted|Verifying)\b[^\n]*)?$/.test(text)
    || /^🍺\s+\/[^\n]+:\s+\d+ files?, [\d.]+[KMGT]?B(?:, [^\n]+)?$/.test(text);
}

function possibleRoutine(text: string): boolean {
  const value = text.trimStart();
  return !diagnostic.test(value) && (routinePrefixes.some(prefix => prefix.startsWith(value) || value.startsWith(prefix)) || /^\d/.test(value));
}

const trustHeader = "Warning: The following taps are not trusted:";
const trustEnd = "https://docs.brew.sh/Tap-Trust";
const trustText = new Set([
  "", "Homebrew is currently ignoring formulae, casks and commands",
  "from these taps because tap trust is required.",
  "Prefer trusting only the specific formulae, casks or commands you need.",
  "Trust installed formulae from these taps with:", "Trust installed casks from these taps with:",
  "Whole-tap trust is broader and includes all current and future formulae,",
  "casks and commands from the listed taps. Trust whole taps with:",
  "Untap them with:", "For more information, see:", trustEnd,
]);

function summarizeTrust(lines: string[]): string | undefined {
  const taps: string[] = [];
  let index = 1;
  while (/^  [\w.-]+\/[\w.-]+$/.test(lines[index] ?? "")) taps.push(lines[index++]!.trim());
  if (!taps.length || taps.includes("jongjinchoi/temper-domains")) return;
  const body = lines.slice(index).map(line => line.trim());
  if (!body.includes("from these taps because tap trust is required.") || body.at(-1) !== trustEnd) return;
  if (!body.every(line => trustText.has(line)
    || /^Trust (?:other )?specific (?:formulae, casks or commands|formulae and casks|formulae and commands|casks and commands|formulae|casks|commands) with:$/.test(line)
    || /^brew (?:trust(?: --(?:formula|cask|command))?|untap) [\w./<> -]+$/.test(line))) return;
  return `Warning: Homebrew is ignoring ${taps.length} untrusted taps:\n${taps.join(", ")}\nRun brew doctor for details.\n`;
}

/** Bounded, incremental terminal text decoder. Child cursor/OSC controls never
 * own Temper's screen. CR, CRLF and split escape sequences share the same path. */
export class InstallerMessages {
  private pending = "";
  private escape: "none" | "start" | "csi" | "osc" | "osc-end" = "none";
  private afterCR = false;
  private partial = false;
  private block: string[] = [];
  private blockSize = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private blockTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private emit: (text: string, partial: boolean) => void) {}

  write(chunk: string) {
    clearTimeout(this.timer);
    for (const char of chunk) {
      if (this.escape !== "none") {
        if (this.escape === "start") this.escape = char === "[" ? "csi" : char === "]" ? "osc" : "none";
        else if (this.escape === "csi" && /[@-~]/.test(char)) this.escape = "none";
        else if (this.escape === "osc") { if (char === "\x07") this.escape = "none"; else if (char === "\x1b") this.escape = "osc-end"; }
        else if (this.escape === "osc-end") this.escape = char === "\\" ? "none" : "osc";
        continue;
      }
      if (char === "\x1b") { this.escape = "start"; continue; }
      if (char === "\r" || char === "\n") {
        if (char === "\r" || !this.afterCR) this.line();
        this.afterCR = char === "\r";
      } else if (char >= " " || char === "\t") {
        this.afterCR = false;
        this.pending += char;
        if (this.pending.length >= 8192) this.flushPartial();
      }
    }
    if (!this.pending) return;
    // Recognizable questions must not wait for a newline (getch/readline).
    if (question.test(this.pending)) this.flushPartial();
    else this.timer = setTimeout(() => { if (!routine(this.pending)) this.flushPartial(); }, possibleRoutine(this.pending) ? 1500 : 300);
  }

  private line() {
    const text = this.pending; this.pending = "";
    if (this.partial) { this.emit(`${text}\n`, false); this.partial = false; return; }
    if (text === trustHeader || this.block.length) {
      if (!this.block.length) this.blockTimer = setTimeout(() => this.flushBlock(), 1500);
      this.block.push(text); this.blockSize += text.length + 1;
      if (text.trim() === trustEnd) {
        const summary = summarizeTrust(this.block);
        if (summary) { this.resetBlock(); this.emit(summary, false); }
        else this.flushBlock();
      } else if (this.blockSize >= 16384 || (this.block.length > 1 && diagnostic.test(text))) this.flushBlock();
      return;
    }
    if (text.trim() && !routine(text)) this.emit(`${text}\n`, question.test(text));
  }

  private resetBlock() { clearTimeout(this.blockTimer); this.block = []; this.blockSize = 0; }
  private flushBlock() {
    if (!this.block.length) return;
    const text = this.block.join("\n") + "\n"; this.resetBlock(); this.emit(text, false);
  }
  private flushPartial() {
    if (!this.pending) return;
    this.flushBlock();
    this.emit(this.pending, true); this.pending = ""; this.partial = true;
  }
  finish() {
    clearTimeout(this.timer); clearTimeout(this.blockTimer);
    if (this.pending) this.line();
    this.flushBlock();
    if (this.partial) { this.emit("\n", false); this.partial = false; }
  }
}
