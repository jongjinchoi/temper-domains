import { expect, test } from "bun:test";

test.each([
  ['Asia/Seoul', '2026-09-27T23:30:00Z', '2026-09-28 08:30'],
  ['Asia/Seoul', '2026-12-31T15:00:00Z', '2027-01-01 00:00'],
  ['UTC', '2026-09-27T23:30:00Z', '2026-09-27 23:30'],
  ['America/New_York', '2026-03-08T06:59:00Z', '2026-03-08 01:59'],
  ['America/New_York', '2026-03-08T07:00:00Z', '2026-03-08 03:00'],
  ['America/New_York', '2026-11-01T05:30:00Z', '2026-11-01 01:30'],
  ['America/New_York', '2026-11-01T06:30:00Z', '2026-11-01 01:30'],
  ['America/New_York', '2026-10-01T00:00:00Z', '2026-09-30 20:00'],
])('formats local history time in %s at %s', async (tz, timestamp, expected) => {
  const child = Bun.spawn([process.execPath, '-e', 'import { formatHistoryTimestamp } from "./src/tui/format-date.ts"; console.log(formatHistoryTimestamp(process.env.TEST_TIMESTAMP));'], {
    env: { ...process.env, TZ: tz, TEST_TIMESTAMP: timestamp }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(await child.exited).toBe(0);
  expect((await new Response(child.stdout).text()).trim()).toBe(expected!);
});
