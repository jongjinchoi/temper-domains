import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { nativeArchiveFiles } from "./source-package.ts";

// Archives mirror scripts/source-package.ts; a changed file list breaks both sides.
async function archive(dir: string, name: string, files: readonly string[], executable = true) {
  const stage = join(dir, `stage-${name}`);
  await mkdir(stage);
  for (const file of files) await writeFile(join(stage, file), `fixture ${file}`);
  await chmod(join(stage, "temper"), executable ? 0o755 : 0o644).catch(() => {});
  const output = join(dir, `${name}.tar.gz`);
  expect(await Bun.spawn(["tar", "-czf", output, "-C", stage, ...files]).exited).toBe(0);
  return output;
}

test("formula changes only after all four archives pass download and archive checks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "temper-formula-"));
  const script = resolve("scripts/update-homebrew.sh");
  const files = nativeArchiveFiles("bun-darwin-arm64");
  let failure = "none";
  const requests: string[] = [];
  const archives: Record<string, string> = {};
  const server = createServer(async (request, response) => {
    const path = request.url!;
    requests.push(path);
    if (path.includes("linux-arm64")) {
      if (failure === "404" || failure === "500") { response.writeHead(Number(failure)); response.end("error"); return; }
      if (failure === "invalid") { response.end("not an archive"); return; }
      if (failure === "disconnect") { request.socket.destroy(); return; }
      if (archives[failure]) { response.end(await readFile(archives[failure]!)); return; }
    }
    response.end(await readFile(archives.good!));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    archives.good = await archive(dir, "good", files);
    archives.missing = await archive(dir, "missing", files.filter(file => file !== "SOURCE.md"));
    archives.extra = await archive(dir, "extra", [...files, "EXTRA.md"]);
    archives.noexec = await archive(dir, "noexec", files, false);
    const formula = join(dir, "temper.rb");
    for (const mode of ["404", "500", "disconnect", "invalid", "missing", "extra", "noexec", "none"]) {
      failure = mode;
      requests.length = 0;
      await writeFile(formula, "original formula\n");
      const child = Bun.spawn(["bash", script, "0.7.0", `http://127.0.0.1:${address.port}`, formula], { stdout: "pipe", stderr: "pipe" });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(requests.length, `${mode}: ${stderr}`).toBeGreaterThanOrEqual(4);
      if (mode !== "none") {
        expect(code, `${mode}: ${stderr}`).not.toBe(0);
        expect(await readFile(formula, "utf8")).toBe("original formula\n");
      } else {
        expect(code, stderr).toBe(0);
        const sha = createHash("sha256").update(await readFile(archives.good)).digest("hex");
        expect((await readFile(formula, "utf8")).match(new RegExp(sha, "g"))).toHaveLength(4);
      }
    }
  } finally { server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true }); }
}, 30000);
