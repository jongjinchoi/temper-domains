import { expect, test } from "bun:test";
import { runProcess } from "./process.ts";
import { InstallerOutput, terminalCommand } from "./installer.ts";

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
