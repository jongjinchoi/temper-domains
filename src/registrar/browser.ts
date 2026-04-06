import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
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

  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}
