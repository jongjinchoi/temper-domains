import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface BrowserRequest { kind: "accepted" | "unconfirmed"; url: string }
export async function openBrowser(url: string, options: {
  launch?: (command: string, args: string[]) => ChildProcess;
  timeoutMs?: number;
} = {}): Promise<BrowserRequest> {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  switch (platform) {
    case "darwin":
      cmd = "open";
      args = [url];
      break;
    case "linux":
      cmd = "xdg-open";
      args = [url];
      break;
    case "win32":
      cmd = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  return new Promise((resolve, reject) => {
    const child = (options.launch ?? ((command, argv) => spawn(command, argv, { detached: true, stdio: "ignore" })))(cmd, args);
    let settled = false;
    const finish = (error?: Error, kind: BrowserRequest["kind"] = "accepted") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Do not terminate a browser that the launcher may have started.
      child.unref();
      if (error) reject(error); else resolve({ kind, url });
    };
    const timer = setTimeout(() => finish(undefined, "unconfirmed"), options.timeoutMs ?? 5000);
    // Keep the error listener after timeout to consume late spawn errors.
    // Mixed Node declarations under TS7 lose ChildProcess's event interface.
    const events = child as unknown as EventEmitter;
    events.once("error", (error: Error) => finish(error));
    events.once("close", (code: number | null, signal: string | null) => finish(code === 0 ? undefined : new Error(`Browser launcher exited ${code ?? signal}`)));
  });
}
