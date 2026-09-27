import { expect, test } from "bun:test";

async function run(scenario: string, mode = "automatic") {
  const child = Bun.spawn([process.execPath, "tests/helpers/update-diagnostics-worker.ts", scenario, mode], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  return JSON.parse(stdout);
}
for (const [scenario, expected] of [
  ["installation", /installation.*EACCES/i], ["http", /HTTP 503/], ["invalid", /invalid.*response/i],
  ["network", /published version.*ENOTFOUND/i], ["timeout", /timed out.*installation/i], ["remote-timeout", /timed out.*published version/i],
] as const) {
  test(`automatic ${scenario} failure explains the cause and continues the command`, async () => {
    const result = await run(scenario);
    expect(result.stop).toBe(false); expect(result.exitCode).toBe(0);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatch(expected);
    expect(result.messages[0]).toContain("temper update --check");
    expect(result.messages[0]).not.toContain("private");
    expect(result.messages[0]).not.toMatch(/[\n\x1b]/);
    if (scenario === "installation" || scenario === "timeout") expect(result.fetched).toBe(0);
  });
}
test("manual check retains failure context and JSON commands skip automatic work", async () => {
  const manual = await run("http", "manual");
  expect(manual.manualError).toContain("HTTP 503"); expect(manual.messages).toEqual([]);
  const json = await run("http", "json");
  expect(json).toMatchObject({ stop: false, messages: [], detected: 0, fetched: 0 });
  const success = await run("success");
  expect(success).toMatchObject({ stop: false, messages: [], detected: 1, fetched: 1 });
});
