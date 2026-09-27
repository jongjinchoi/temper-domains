import { mock } from "bun:test";
import * as installation from "../../src/update/installation.ts";

const scenario = process.argv[2]!;
const mode = process.argv[3] ?? "automatic";
let detected = 0, fetched = 0;
mock.module("../../src/update/installation.ts", () => ({ ...installation,
  currentEntry: async () => "/controlled/temper.js",
  detectInstallation: async ({ signal }: { signal: AbortSignal }) => {
    detected++;
    if (scenario === "installation") throw Object.assign(new Error("private path\n\x1b[31m"), { code: "EACCES" });
    if (scenario === "timeout") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    return { kind: "manual", entry: "/controlled/temper.js", identity: "fixture", channel: "npm", guidance: "controlled manual guidance" };
  },
}));
globalThis.fetch = (async (_url: string, options: RequestInit) => {
  fetched++;
  if (scenario === "http") return new Response("private upstream body", { status: 503 });
  if (scenario === "invalid") return new Response("{private invalid json");
  if (scenario === "network") throw new TypeError("private network details", { cause: Object.assign(new Error("private host"), { code: "ENOTFOUND" }) });
  if (scenario === "remote-timeout") return new Promise((_, reject) => options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true }));
  return Response.json({ name: "temper-domains", version: "0.0.1" });
}) as typeof fetch;
Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
for (const key of ["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "TEMPER_NO_UPDATE_CHECK"]) delete process.env[key];
const messages: string[] = [];
console.error = (...args) => { messages.push(args.join(" ")); };
const { maybeUpdate, updateCommand } = await import("../../src/update/cli.ts");
let stop = false, manualError: string | undefined;
if (mode === "manual") {
  try { await updateCommand(true); } catch (error) { manualError = (error as Error).message; }
} else stop = await maybeUpdate("search", mode === "json" ? "json" : undefined);
console.log(JSON.stringify({ stop, messages, manualError, detected, fetched, exitCode: process.exitCode ?? 0 }));
