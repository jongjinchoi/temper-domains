import { expect, test } from "bun:test";
import { runProcess } from "./process.ts";
import { InstallerOutput, terminalCommand } from "./installer.ts";

// Homebrew 7.0.6 diagnostic.rb format; tap names from the user's screenshot.
const trustWarning = `Warning: The following taps are not trusted:
  getsentry/tools
  stripe/stripe-cli
  supabase/tap

Homebrew is currently ignoring formulae, casks and commands
from these taps because tap trust is required.
Prefer trusting only the specific formulae, casks or commands you need.
Trust installed formulae from these taps with:
  brew trust --formula getsentry/tools/sentry-cli
  brew trust --formula stripe/stripe-cli/stripe
Trust other specific casks and commands with:
  brew trust --cask <user>/<tap>/<cask>
  brew trust --command <user>/<tap>/<command>
Whole-tap trust is broader and includes all current and future formulae,
casks and commands from the listed taps. Trust whole taps with:
  brew trust getsentry/tools stripe/stripe-cli supabase/tap
Untap them with:
  brew untap getsentry/tools stripe/stripe-cli supabase/tap
For more information, see:
  https://docs.brew.sh/Tap-Trust
`;

test("routine output stays hidden at every delayed chunk boundary", async () => {
  const lines = [
    "Removing: /tmp/cache/file... (120KB)\r\n",
    "==> Would upgrade 1 requested outdated package\r\n",
    "\x1b[2K\r⠋ Formula temper (0.6.0) #### Downloading 10.9MB/28.0MB\x1b[1A\r",
    "✔︎ Formula temper (0.6.0) Downloaded 28.0MB/28.0MB\r\n",
    "==> Installing temper from jongjinchoi/temper-domains\n",
  ];
  // Independent views let every split experience a real delay without N sleeps.
  for (const line of lines) {
    const samples = Array.from({ length: line.length + 1 }, (_, split) => {
      let output = "";
      const view = new InstallerOutput("Updating Temper", text => { output += text; });
      view.write(line.slice(0, split));
      return { view, split, output: () => output };
    });
    await new Promise(resolve => setTimeout(resolve, 70));
    for (const sample of samples) {
      sample.view.write(line.slice(sample.split)); sample.view.finish();
      expect(sample.output()).not.toMatch(/Removing:|Would upgrade|Downloading|Downloaded|Formula temper|==> Installing|\x1b\[1A/);
    }
  }
});

test("wrapper stderr cannot complete a PTY stdout line or resume progress over an input prompt", () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper", text => { output += text; });
  view.write("Password: ", "stdout");
  view.write("Warning: terminal relay diagnostic\n", "stderr");
  expect(output.slice(output.indexOf("Password:"))).not.toContain("Updating Temper");
  view.write("accepted\n", "stdout"); view.finish();
  expect(output).toContain("Password: ");
  expect(output).toContain("Warning: terminal relay diagnostic");
  expect(output).toContain("accepted");
});

test("recognized tap warning is summarized without losing excluded tap identities", () => {
  for (let split = 0; split <= trustWarning.length; split++) {
    let output = "";
    const view = new InstallerOutput("Updating Temper", text => { output += text; });
    view.write(trustWarning.slice(0, split)); view.write(trustWarning.slice(split)); view.finish();
    expect(output).toContain("Warning: Homebrew is ignoring 3 untrusted taps");
    expect(output).toContain("getsentry/tools, stripe/stripe-cli, supabase/tap");
    expect(output).toContain("brew doctor");
    expect(output).not.toContain("brew trust");
  }
});

test("unexpected or target-tap warning content and diagnostics cannot be swallowed", () => {
  for (const warning of [
    trustWarning.replace("getsentry/tools", "jongjinchoi/temper-domains"),
    trustWarning.replace("For more information, see:", "Error: dependency checksum mismatch\nProceed?"),
    trustWarning.replace("Untap them with:", "Unexpected recovery instruction"),
    trustWarning.slice(0, 250),
  ]) {
    let output = "";
    const view = new InstallerOutput("Updating Temper", text => { output += text; });
    view.write(warning); view.finish();
    for (const line of warning.trim().split("\n").filter(Boolean)) expect(output).toContain(line);
  }
});

test("split ANSI never reaches the screen and unknown unterminated input stays usable", async () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper", text => { output += text; });
  view.write("\x1b[");
  await new Promise(resolve => setTimeout(resolve, 70));
  view.write("31mError: checksum mismatch\x1b[0m\r\nType a confirmation token: ");
  await new Promise(resolve => setTimeout(resolve, 600));
  expect(output).toContain("Error: checksum mismatch");
  expect(output).toContain("Type a confirmation token: ");
  expect(output).not.toContain("\x1b[31m");
  view.finish();
});

test("a complete Homebrew getch question pauses progress until the child responds", () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper", text => { output += text; });
  view.write("==> Do you want to proceed with the upgrade? [y/n]\r\n");
  expect(output.slice(output.indexOf("Do you want"))).not.toContain("Updating Temper");
  view.write("Confirmed\r\n"); view.finish();
  expect(output).toContain("Confirmed");
});

test("animated progress returns to column zero even while the relay uses raw terminal mode", () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper", text => { output += text; }, true);
  view.finish();
  expect(output).toContain("\r\nCtrl+C to cancel");
});

test("installer output hides known routine lines but preserves warnings, errors and partial questions", async () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper… 0.5.1 → 0.5.2", text => { output += text; });
  view.write("==> Cleanup\r\nRemov");
  view.write("ing: /opt/homebrew/Cellar/temper/0.5.1... (4 files, 70MB)\r\n");
  view.write("Warning: dependency requires attention\r\nError: permission denied\r\nUnknown diagnostic\r\nProceed? ");
  await new Promise(resolve => setTimeout(resolve, 80));
  expect(output).toContain("Proceed? ");
  view.write("y\r\n");
  view.finish();
  expect(output).not.toContain("Cleanup");
  expect(output).not.toContain("Removing:");
  expect(output).toContain("Warning: dependency requires attention");
  expect(output).toContain("Error: permission denied");
  expect(output).toContain("Unknown diagnostic");
});

test("large output is streamed without truncating diagnostics or accumulating a full log", () => {
  let diagnostics = 0;
  const view = new InstallerOutput("Updating Temper", text => { if (text.includes("Warning:")) diagnostics++; });
  for (let i = 0; i < 20000; i++) view.write("Removing: /tmp/cache/file... (120KB)\n");
  view.write("Warning: final diagnostic\n");
  view.finish();
  expect(diagnostics).toBe(1);
});

test("oversized diagnostic lines and incomplete warning blocks preserve their full text", async () => {
  let output = "";
  const view = new InstallerOutput("Updating Temper", text => { output += text; });
  const diagnostic = "Error: " + "x".repeat(20000);
  view.write(diagnostic);
  expect(output).toContain("Error: "); // Bounded flushing before newline/exit.
  view.write("\n");
  view.write("Warning: The following taps are not trusted:\n  other/tap\n");
  await new Promise(resolve => setTimeout(resolve, 1600));
  expect(output).toContain("other/tap"); // An incomplete block cannot wait forever.
  view.finish();
  expect(output).toContain(diagnostic);
});

test("terminal relay passes literal arguments and requests exit status propagation", async () => {
  const command = { file: "/path with spaces/brew", args: ["upgrade", "a'$(echo bad); b"] };
  if (process.platform !== "win32") {
    const literal = "a'$(not-a-command); b";
    const invocation = terminalCommand({ file: process.execPath, args: ["-e", "console.log(process.argv[1])", literal] }, "linux");
    expect((await runProcess({ file: "/bin/sh", args: ["-c", invocation.args[4]!] })).stdout.trim()).toBe(literal);
  }
  expect(terminalCommand(command, "darwin").args).toEqual(["-q", "/dev/null", command.file, ...command.args]);
  expect(terminalCommand(command, "linux").args).toEqual(["-q", "-e", "-f", "-c", "exec '/path with spaces/brew' 'upgrade' 'a'\\''$(echo bad); b'", "/dev/null"]);
});
