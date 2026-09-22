import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface Invocation { file: string; args: string[] }
export interface ProcessOptions { signal?: AbortSignal; inherit?: boolean; env?: NodeJS.ProcessEnv }

export function displayInvocation(command: Invocation): string {
  return [command.file, ...command.args].map(part => /^[\w./:@=+-]+$/.test(part) ? part : JSON.stringify(part)).join(" ");
}

export function runProcess(command: Invocation, options: ProcessOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("Update check cancelled or timed out")); return; }
    const child = spawn(command.file, command.args, {
      shell: false, stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    let interrupted = false;
    const stop = () => { interrupted = true; child.kill(); };
    const interrupt = () => { interrupted = true; child.kill("SIGINT"); };
    const terminate = () => { interrupted = true; child.kill("SIGTERM"); };
    options.signal?.addEventListener("abort", stop, { once: true });
    if (options.signal?.aborted) stop();
    if (options.inherit) { process.on("SIGINT", interrupt); process.on("SIGTERM", terminate); }
    const collect = (chunk: Buffer, stream: "stdout" | "stderr") => {
      if (stream === "stdout") stdout += chunk.toString(); else stderr += chunk.toString();
      if (stdout.length + stderr.length > 1024 * 1024) { failure = new Error("Package manager response is too large"); child.kill(); }
    };
    child.stdout?.on("data", chunk => collect(chunk, "stdout"));
    child.stderr?.on("data", chunk => collect(chunk, "stderr"));
    // ChildProcess is an EventEmitter; the installed mixed Node declarations
    // lose its merged event interface under TypeScript 7.
    const events = child as unknown as EventEmitter;
    events.on("error", (error: Error) => { failure = error; });
    events.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      options.signal?.removeEventListener("abort", stop);
      if (options.inherit) { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
      if (failure) reject(failure);
      else if (interrupted || signal) reject(new Error(`Update command interrupted${signal ? ` (${signal})` : " or timed out"}`));
      else if (code !== 0) reject(new Error(`Command failed (exit ${code}): ${displayInvocation(command)}${stderr.trim() ? `\n${stderr.trim().slice(0, 2000)}` : ""}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function withInstallLock<T>(directory: string, identity: string, work: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `update-${createHash("sha256").update(identity).digest("hex")}.lock`);
  const lock = await open(path, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(`An update is already running or its lock remains: ${path}. Remove this file only after confirming no updater is running.`);
    throw error;
  });
  try { await lock.writeFile(`${process.pid}\n`); return await work(); }
  finally { await lock.close(); await unlink(path); }
}
