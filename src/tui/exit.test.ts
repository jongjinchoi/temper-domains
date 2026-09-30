import { expect, test } from "bun:test";

test.skipIf(process.platform === "win32")("real TUI exits drain storage and preserve nonvisual commands with damaged settings", async () => {
  const child = Bun.spawn(["python3", "tests/helpers/tui-exit-check.py", process.execPath, "src/index.ts"], {
    stdout: "pipe", stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, err, completed: out.trim().split("\n").length }).toEqual({ code: 0, err: "", completed: 33 });
}, 120000);
