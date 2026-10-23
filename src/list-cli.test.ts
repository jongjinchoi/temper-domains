import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function list(entries: unknown[] | undefined, lock = false) {
  const home = await mkdtemp(join(tmpdir(), "temper-list-"));
  try {
    const file = join(home, ".temper", "watchlist.json");
    if (entries) { await mkdir(join(home, ".temper")); await writeFile(file, JSON.stringify(entries)); }
    if (lock) await writeFile(`${file}.lock`, "other process");
    const child = Bun.spawn([process.execPath, "--preload", "./tests/helpers/list-json-preload.ts", "src/index.ts", "list", "--format", "json"], {
      env: { ...process.env, HOME: home, TEMPER_TEST_HOME: home }, stdout: "pipe", stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    const effects = await readFile(join(home, "effects"), "utf8").catch(() => "");
    const saved = await readFile(file, "utf8").then(JSON.parse, () => undefined);
    return { code, out, err, effects, saved };
  } finally { await rm(home, { recursive: true, force: true }); }
}

test("list --format json prints an empty array without rendering or update checks", async () => {
  const result = await list(undefined);
  expect({ code: result.code, err: result.err, out: JSON.parse(result.out), effects: result.effects }).toEqual({ code: 0, err: "", out: [], effects: "" });
});

test("list --format json checks watched domains, prints saved metadata and saves the answers", async () => {
  const result = await list([
    { domain: "taken.com", addedAt: "2026-01-01T00:00:00Z" },
    { domain: "free.dev", addedAt: "2026-01-02T00:00:00Z", lastStatus: "taken", checkedAt: "2026-01-03T00:00:00.000Z" },
  ]);
  expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
  expect(result.effects).not.toMatch(/update|render/);
  const rows = Object.fromEntries((JSON.parse(result.out) as { domain: string }[]).map(row => [row.domain, row]));
  expect(rows["taken.com"]).toMatchObject({ status: "taken", addedAt: "2026-01-01T00:00:00Z", expiryDate: "2027-06-01T00:00:00Z",
    registrar: "Example Registrar", statusCodes: ["active"] });
  expect(rows["free.dev"]).toMatchObject({ status: "available", addedAt: "2026-01-02T00:00:00Z", previousStatus: "taken" });
  expect(rows["free.dev"]).toHaveProperty("statusChangedAt");
  expect(result.saved).toEqual([
    expect.objectContaining({ domain: "taken.com", lastStatus: "taken", expiryDate: "2027-06-01T00:00:00Z" }),
    expect.objectContaining({ domain: "free.dev", lastStatus: "available", previousStatus: "taken" }),
  ]);
});

test("list --format json still prints the answers but exits 1 when saving them fails", async () => {
  const result = await list([{ domain: "taken.com", addedAt: "2026-01-01T00:00:00Z" }], true);
  expect(result.code).toBe(1);
  expect((JSON.parse(result.out) as { status: string }[])[0]!.status).toBe("taken");
  expect(result.err).toContain("Watchlist is busy");
  expect(result.saved).toEqual([{ domain: "taken.com", addedAt: "2026-01-01T00:00:00Z" }]);
}, 15000);
