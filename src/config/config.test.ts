import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, lstat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
let file: string;
const old = '{"theme":"temper-forge","registrar":"cloudflare","extra":"keep"}';
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "temper-config-"));
  await mkdir(join(home, ".temper"));
  file = join(home, ".temper/config.json");
});
afterEach(() => rm(home, { recursive: true, force: true }));

function worker(partial: object | "load", env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "tests/helpers/config-worker.ts", typeof partial === "string" ? partial : JSON.stringify(partial)], {
    cwd: import.meta.dir + "/../..", env: { ...process.env, TEMPER_TEST_HOME: home, ...env }, stdout: "pipe", stderr: "pipe",
  });
  const result = Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { child, result };
}
async function untilFile(path: string) {
  const deadline = Date.now() + 3000;
  while (!(await Bun.file(path).exists()) && Date.now() < deadline) await Bun.sleep(10);
  expect(await Bun.file(path).exists()).toBe(true);
}

test("config writer waits for another writer and merges the latest registrar", async () => {
  await writeFile(file, old);
  await writeFile(file + ".lock", "owner");
  const job = worker({ theme: "dracula" });
  try {
    await untilFile(join(home, `ready-${job.child.pid}`));
    await Bun.sleep(100);
    expect(await readFile(file, "utf8")).toBe(old);
    await writeFile(file, '{"theme":"temper-forge","registrar":"namecheap","extra":"keep"}');
    await rm(file + ".lock");
    const [code, stdout, stderr] = await job.result;
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout)).toEqual({ theme: "dracula", registrar: "namecheap", extra: "keep" });
  } finally { job.child.kill(); await job.result; }
});

test("separate config processes preserve both successful partial updates", async () => {
  await writeFile(file, old);
  const jobs = [worker({ theme: "catppuccin-mocha" }), worker({ registrar: "namecheap" })];
  for (const [code, , stderr] of await Promise.all(jobs.map(j => j.result))) expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ theme: "catppuccin-mocha", registrar: "namecheap", extra: "keep" });
  expect(await readdir(join(home, ".temper"))).toEqual(["config.json"]);
});

test("first config save fills defaults without requiring an existing file", async () => {
  const [code, stdout] = await worker({ theme: "dracula" }).result;
  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toEqual({ theme: "dracula", registrar: "cloudflare" });
});

test.each(["{", '{"theme":42}'])("invalid config is preserved: %s", async content => {
  await writeFile(file, content);
  const [code, , error] = await worker({ theme: "dracula" }).result;
  expect(code).toBe(1);
  expect(error).toContain("repair");
  expect(await readFile(file, "utf8")).toBe(content);
  expect(await readdir(join(home, ".temper"))).toEqual(["config.json"]);
});

test.each(["open", "write", "sync", "close", "rename"])("failed %s preserves config and releases owned files", async fail => {
  await writeFile(file, old);
  const [code, , error] = await worker({ theme: "dracula" }, { TEMPER_CONFIG_FAIL: fail }).result;
  expect(code).toBe(1);
  expect(error).toContain(`test ${fail} failed`);
  expect(await readFile(file, "utf8")).toBe(old);
  expect(await readdir(join(home, ".temper"))).toEqual(["config.json"]);
});

test("lock timeout leaves the existing config and the owner's lock intact", async () => {
  await writeFile(file, old);
  await writeFile(file + ".lock", "owner");
  const [code, , error] = await worker({ theme: "dracula" }).result;
  expect(code).toBe(1);
  expect(error).toContain("busy");
  expect(await readFile(file, "utf8")).toBe(old);
  expect(await readFile(file + ".lock", "utf8")).toBe("owner");
}, 10000);

test("cleanup failure after replacement reports that config was saved", async () => {
  await writeFile(file, old);
  const [code, , stderr] = await worker({ theme: "dracula" }, { TEMPER_CONFIG_FAIL: "cleanup" }).result;
  expect(code).toBe(1);
  expect(JSON.parse(stderr).committed).toBe(true);
  expect(stderr).toContain("saved");
  expect(JSON.parse(await readFile(file, "utf8")).theme).toBe("dracula");
  expect(await Bun.file(file + ".lock").exists()).toBe(true);
});

test("cleanup failure does not hide the original write failure", async () => {
  await writeFile(file, old);
  const [code, , stderr] = await worker({ theme: "dracula" }, { TEMPER_CONFIG_FAIL: "write-cleanup" }).result;
  expect(code).toBe(1);
  expect(stderr).toContain("test write-cleanup failed");
  expect(stderr).toContain("test lock cleanup failed");
  expect(JSON.parse(stderr).committed).toBe(false);
  expect(await readFile(file, "utf8")).toBe(old);
});

test.each([false, true])("saving through a symlink preserves the link (missing target: %s)", async missing => {
  const target = join(home, "linked.json");
  if (!missing) await writeFile(target, old);
  await symlink("../linked.json", file);
  expect((await worker({ theme: "dracula" }).result)[0]).toBe(0);
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  expect(JSON.parse(await readFile(target, "utf8")).theme).toBe("dracula");
});

test.each(["before", "after"])("reader sees a complete file when writer stops %s replacement", async pause => {
  await writeFile(file, old);
  const job = worker({ theme: "dracula" }, { TEMPER_CONFIG_PAUSE: pause });
  try {
    await untilFile(join(home, "paused"));
    const [code, stdout] = await worker("load").result;
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ theme: pause === "before" ? "temper-forge" : "dracula", registrar: "cloudflare", extra: "keep" });
    job.child.kill("SIGKILL");
    await job.result;
    expect(JSON.parse(await readFile(file, "utf8")).theme).toBe(pause === "before" ? "temper-forge" : "dracula");
    expect(await Bun.file(file + ".lock").exists()).toBe(true);
  } finally { job.child.kill(); await job.result; }
});
