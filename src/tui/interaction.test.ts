import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function scenario(name: string, helper = "tui-worker.tsx") {
  const home = await mkdtemp(join(tmpdir(), "temper-tui-"));
  try {
    const child = Bun.spawn([process.execPath, `tests/helpers/${helper}`, name], {
      cwd: import.meta.dir + "/../..", env: { ...process.env, TEMPER_TEST_HOME: home },
      stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    return JSON.parse(stdout);
  } finally { await rm(home, { recursive: true, force: true }); }
}

test("uppercase search renders the completed domain status", async () => {
  const result = await scenario("uppercase");
  expect(result.frame).toContain("acme.com");
  expect(result.frame).toContain("available");
  expect(result.frame).not.toContain("checking");
});

test("bootstrap failure becomes an error screen without a successful history entry", async () => {
  const result = await scenario("bootstrap");
  expect(result.unhandled).toEqual([]);
  expect(result.frame).toContain("Search failed");
  expect(result.frame).toContain("test bootstrap unavailable");
  expect(result.frame).not.toContain("Search complete");
  expect(result.history).toEqual([]);
});

test("escape from a suggestion search returns only to the suggestion list", async () => {
  const result = await scenario("suggest");
  expect(result.back).toBe(0);
  expect(result.frame).not.toContain("temper search");
  expect(result.frame).toContain("Acme");
});

test.each(["watch-corrupt", "history-corrupt"])("%s shows a repair message instead of rejecting outside the UI", async (name) => {
  const result = await scenario(name);
  expect(result.unhandled).toEqual([]);
  expect(result.frame).toContain("repair");
  expect(result.frame).toContain("not been overwritten");
});

test("uppercase suggestion names and affixes render their completed rows", async () => {
  const result = await scenario("suggest-uppercase");
  expect(result.frame).toMatch(/Acme\s+.*available/);
  expect(result.frame).toMatch(/GetAcme\s+.*available/);
  expect(result.frame).toMatch(/AcmeApp\s+.*taken/);
  expect(result.frame).not.toContain("checking");
  expect(result.unhandled).toEqual([]);
});

test("suggestion bootstrap failure renders terminal errors for uppercase candidates", async () => {
  const result = await scenario("suggest-bootstrap");
  expect(result.frame).toMatch(/Acme\s+.*error/);
  expect(result.frame).toMatch(/GetAcme\s+.*error/);
  expect(result.frame).not.toContain("checking");
});

test("history save failure preserves search results and shows a separate warning", async () => {
  const result = await scenario("history-save-failure");
  expect(result.frame).toContain("Search complete");
  expect(result.frame).toContain("available");
  expect(result.frame).toContain("History was not saved");
  expect(result.frame).not.toContain("Search failed");
  expect(result.history).toEqual({});
});

test("a stale history screen refreshes without deleting the selected or new entry", async () => {
  const result = await scenario("history-delete-conflict");
  expect(result.frame).toContain("History changed");
  expect(result.frame).toContain("selected");
  expect(result.frame).toContain("new");
  expect(result.history.map((entry: { query: string }) => entry.query)).toEqual(["new", "selected", "older"]);
  expect(result.unhandled).toEqual([]);
});

test("a partial suggestion failure does not hide completed rows", async () => {
  const result = await scenario("suggest-partial");
  expect(result.frame).toMatch(/Acme\s+.*available/);
  expect(result.frame).toMatch(/GetAcme\s+.*error/);
  expect(result.frame).toMatch(/AcmeApp\s+.*available/);
  expect(result.frame).not.toContain("checking");
});

test("leaving suggestions cancels running lookups without an unhandled rejection", async () => {
  const result = await scenario("suggest-cancel");
  expect(result.started).toBeGreaterThan(0);
  expect(result.aborted).toBe(result.started);
  expect(result.unhandled).toEqual([]);
});

test("repeated delete input during a pending write removes only the selected entry", async () => {
  const result = await scenario("history-delete-repeat");
  expect(result.history.map((entry: { query: string }) => entry.query)).toEqual(["older"]);
  expect(result.frame).toContain("older");
  expect(result.frame).not.toContain("selected");
  expect(result.unhandled).toEqual([]);
});

test("failed deletion leaves the displayed entries and damaged file intact", async () => {
  const result = await scenario("history-delete-failure");
  expect(result.history).toEqual({});
  expect(result.frame).toContain("repair");
  expect(result.frame).toContain("selected");
  expect(result.frame).toContain("older");
  expect(result.unhandled).toEqual([]);
});

test("init blocks repeated Enter while saving and commits the selected settings once", async () => {
  const result = await scenario("init-repeat", "init-worker.tsx");
  expect(result.pendingFrame).toContain("Saving");
  expect(result.replacements).toBe(1);
  expect(result.config).toEqual({ theme: "seoul-night", registrar: "cloudflare" });
  expect(result.frame).toContain("Setup complete");
  expect(result.unhandled).toEqual([]);
});

test("init displays a failed save and retries with the same selection", async () => {
  const result = await scenario("init-retry", "init-worker.tsx");
  expect(result.unhandled).toEqual([]);
  expect(result.failureFrame).toContain("not saved");
  expect(result.failureFrame).not.toContain("Setup complete");
  expect(result.config.theme).toBe("seoul-night");
  expect(result.frame).toContain("Setup complete");
});

test("init keeps a post-save cleanup warning visible instead of auto-exiting", async () => {
  const result = await scenario("init-cleanup", "init-worker.tsx");
  expect(result.unhandled).toEqual([]);
  expect(result.config.theme).toBe("seoul-night");
  expect(result.frame).toContain("saved");
  expect(result.frame).toContain("cleanup failed");
  expect(result.exited).toBe(false);
});

test("leaving init during a pending save allows storage cleanup without rejection", async () => {
  const result = await scenario("init-leave", "init-worker.tsx");
  expect(result.pendingFrame).toContain("Saving");
  expect(result.config.theme).toBe("seoul-night");
  expect(result.replacements).toBe(1);
  expect(result.unhandled).toEqual([]);
});

test("scrolling then filtering shows the match immediately and actions use that domain", async () => {
  const result = await scenario("search-filter");
  expect(result.frames.scrolled).toContain("↑ 5 more");
  expect(result.frames.filtered).toContain("1 of 30 matches");
  expect(result.frames.filtered).toContain("acme.com");
  expect(result.frames.filtered).not.toContain("↑");
  expect(result.frames.empty).toContain("0 of 30 matches");
  expect(result.frames.backspace).toContain("acme.com");
  expect(result.frames.deleted).toContain("30 of 30 matches");
  expect(result.frames.deleted).toContain("acme.com");
  expect(result.frames.emptyActions).not.toContain("Where to buy?");
  expect(result.frames.emptyActions).not.toContain("whois");
  expect(result.frames.confirmed).toMatch(/▸\s+acme.com/);
  expect(result.frames.detail).toContain("whois acme.com");
  expect(result.frames.registrar).toMatch(/Selected:\s+acme.com/);
  expect(result.opened).toHaveLength(1);
  expect(result.opened[0]).toContain("acme.com");
  expect(result.watch.map((entry: { domain: string }) => entry.domain)).toEqual(["acme.com"]);
  expect(result.frames.cleared).toMatch(/▸\s+acme.com/);
  expect(result.frames.cleared).toContain("↓ 14 more");
  expect(result.unhandled).toEqual([]);
}, 10000);

test("resizing a scrolled list keeps selection visible and updates hidden counts", async () => {
  const result = await scenario("search-resize");
  const selected = result.frames.scrolled.match(/▸\s+(acme\.[a-z.]+)/)[1];
  expect(result.frames.expanded).toContain(selected);
  expect(result.frames.expanded).not.toContain("↑");
  expect(result.frames.expanded).not.toContain("↓");
  expect(result.frames.shrunk).toContain(selected);
  expect(result.frames.shrunk).toContain("↑ 11 more");
  expect(result.frames.shrunk).toContain("↓ 9 more");
});

test.each(["none", "one", "some"])("available-only completion keeps %s results selectable", async size => {
  const result = await scenario(`search-available-${size}`);
  if (size === "none") {
    expect(result.frame).not.toContain("▸");
    expect(result.frame).not.toContain("Where to buy?");
    expect(result.frame).not.toContain("whois");
    expect(result.watch).toEqual([]);
  } else {
    expect(result.frame).toMatch(/▸\s+acme.com/);
    expect(result.frame).not.toContain("taken");
  }
  expect(result.frame).not.toContain("↑");
  expect(result.frame).not.toContain("↓");
  expect(result.unhandled).toEqual([]);
});


test("search retains answered rows and partial completion guidance on an unresolved result", async () => {
  const result = await scenario("search-partial");
  expect(result.frame).toContain("29/30 answered");
  expect(result.frames.initial).toContain("acme.com");
  expect(result.frame).toContain("acme.dev");
  expect(result.frame).toContain("Partial results");
  expect(result.frame).toContain("HTTP 400");
  expect(result.unhandled).toEqual([]);
});


test("composite suffix remains intact in TUI selection, details, registrar and watchlist", async () => {
  const result = await scenario("search-composite");
  expect(result.frames.selected).toContain("acme.co.uk");
  expect(result.frames.selected).not.toContain("acme.uk");
  expect(result.frames.detail).toContain("whois acme.co.uk");
  expect(result.frames.registrar).toMatch(/Selected:\s+acme.co.uk/);
  expect(result.opened).toHaveLength(1);
  expect(result.opened[0]).toContain("acme.co.uk");
  expect(result.watch.map((entry: { domain: string }) => entry.domain)).toEqual(["acme.co.uk"]);
  expect(result.unhandled).toEqual([]);
});

test("cooldown results show request counts, wait source and retry time in search and detail", async () => {
  const result = await scenario("search-cooldown");
  expect(result.frames.first).toContain("Server limited this request");
  expect(result.frames.first).toContain("Retry no earlier than");
  expect(result.frames.queued).toContain("Not sent: previous server limit");
  expect(result.frames.queued).toContain("attempts: 0");
  expect(result.frames.queued).toContain("server Retry-After");
  expect(result.frames.detail).toContain("Retry no earlier than");
  expect(result.unhandled).toEqual([]);
});

test("suggestions show the selected domain's cooldown without starting another lookup", async () => {
  const result = await scenario("suggest-cooldown");
  expect(result.frames.first).toContain("Server limited this request");
  expect(result.frames.first).toContain("Retry no earlier than");
  expect(result.frames.queued).toContain("Not sent: previous server limit");
  expect(result.frames.queued).toContain("attempts: 0");
  expect(result.frames.queued).toContain("server Retry-After");
  expect(result.unhandled).toEqual([]);
});
