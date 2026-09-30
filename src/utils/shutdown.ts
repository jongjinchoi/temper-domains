import { constants } from "node:os";

// Default signal handling ends the process without running `finally` blocks,
// which leaves a file transaction's lock behind. These handlers let a
// transaction that already holds its lock finish before the process exits.
const SIGNALS: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];

let active = 0;
let shuttingDown = false;
let installed = false;
let whenIdle: (() => void) | undefined;
const forwarders = new Set<(signal: NodeJS.Signals) => boolean>();

export function isShuttingDown(): boolean { return shuttingDown; }

// Marks work that must complete before a signal may end the process.
export function beginCriticalSection(): () => void {
  active++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (--active === 0) whenIdle?.();
  };
}

// While registered, a forwarder that returns true owns the signal (for example
// to pass it to a child that holds the terminal) and the process keeps running.
export function forwardSignals(forward: (signal: NodeJS.Signals) => boolean): () => void {
  installShutdownHandlers();
  forwarders.add(forward);
  return () => { forwarders.delete(forward); };
}

export function installShutdownHandlers(): void {
  if (installed) return;
  installed = true;
  for (const signal of SIGNALS) process.on(signal, () => {
    let forwarded = false;
    for (const forward of forwarders) forwarded = forward(signal) || forwarded;
    if (forwarded) return;
    const code = 128 + (constants.signals[signal] ?? 0);
    // A second signal, or no transaction in progress, exits immediately.
    if (shuttingDown || active === 0) process.exit(code);
    shuttingDown = true;
    whenIdle = () => process.exit(code);
  });
}
