import { expect, test } from "bun:test";

test.each(["later", "cancel", "success", "failure", "changed"])("update prompt %s preserves decisions and restores input", async scenario => {
  const child = Bun.spawn([process.execPath, "tests/helpers/update-prompt-worker.tsx", scenario], { stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, err }).toEqual({ code: 0, err: "" });
  const data = JSON.parse(out);
  expect(data.raw).toBe(false);
  if (["success", "failure"].includes(scenario)) expect(data.modes).toEqual([true, false, true, false]);
  expect(data.frame).toContain("0.4.1");
  expect(data.executed).toBe(["later", "cancel"].includes(scenario) ? 0 : 1);
  expect(data.result.kind).toBe(({ later: "later", cancel: "cancelled", success: "updated", failure: "failed", changed: "cancelled" } as Record<string, string>)[scenario]);
});
