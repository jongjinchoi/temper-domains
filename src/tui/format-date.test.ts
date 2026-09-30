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

async function detail(tz: string, call: string, value: string) {
  const child = Bun.spawn([process.execPath, '-e', `import { formatDetailDate, formatDetailExpiry } from "./src/tui/format-date.ts"; console.log(${call});`], {
    env: { ...process.env, TZ: tz, TEST_VALUE: value }, stdout: 'pipe', stderr: 'pipe',
  });
  expect(await child.exited).toBe(0);
  return (await new Response(child.stdout).text()).trim();
}

// whois.nic.cr sends 'registered: 31.12.1995 18:00:00' with no timezone (observed 2026-09-30).
test.each([
  ['UTC', '1995-12-31 18:00:00', '1995-12-31'],
  ['Asia/Seoul', '1995-12-31 18:00:00', '1995-12-31'],
  ['America/Costa_Rica', '1995-12-31 18:00:00', '1995-12-31'],
  ['America/Los_Angeles', '1995-12-31 18:00:00', '1995-12-31'],
  ['Asia/Seoul', '2020-01-01 00:30:00', '2020-01-01'],
  ['Asia/Seoul', '2020-01-01T00:30:00', '2020-01-01'],
  ['America/Los_Angeles', '2035-01-01', '2035-01-01'],
  ['Asia/Seoul', '2024-08-14T07:01:38Z', '2024-08-14'],
  ['UTC', '2024-08-14T23:30:00+09:00', '2024-08-14'],
  ['Asia/Seoul', '2024-08-14T23:30:00Z', '2024-08-14'],
  ['UTC', 'not disclosed', 'not disclosed'],
])('shows a detail date as written in %s: %s', async (tz, value, expected) => {
  expect(await detail(tz, 'formatDetailDate(process.env.TEST_VALUE)', value)).toBe(expected!);
});

test.each(['UTC', 'Asia/Seoul', 'America/Los_Angeles'])('counts expiry days for a date without a timezone the same way in %s', async tz => {
  const now = 'Date.parse("2027-01-01T12:00:00Z")';
  expect(await detail(tz, `formatDetailExpiry(process.env.TEST_VALUE, ${now})`, '2027-01-04 00:30:00')).toBe('2027-01-04  (in 3 days)');
  expect(await detail(tz, `formatDetailExpiry(process.env.TEST_VALUE, ${now})`, '2027-01-04')).toBe('2027-01-04  (in 3 days)');
  expect(await detail(tz, `formatDetailExpiry(process.env.TEST_VALUE, ${now})`, '2027-01-04T00:30:00Z')).toBe('2027-01-04  (in 3 days)');
});
