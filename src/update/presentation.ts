import { theme } from "../tui/theme.ts";

export interface InstallerContext {
  channel: "homebrew" | "npm";
  stage: "refreshing" | "installing";
  current: string;
  target: string;
}
export type OutputContext = Pick<InstallerContext, "channel" | "stage">;
export type TextRole = "primary" | "text" | "dim" | "green";
export interface Segment { text: string; role: TextRole }
export const CANCEL_HINT = "Ctrl+C to cancel";
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function progressLabel(stage: "refreshing" | "installing" | "verifying", current: string, target: string): string {
  return stage === "verifying" ? "Verifying installation…" : `Updating Temper… ${current} → ${target}`;
}

// Shared row roles/spacing for Ink and the suspended-terminal installer relay.
export function progressRows(label: string, spinner: string, cancellable = true): Segment[][] {
  const rows: Segment[][] = [[{ text: spinner, role: "primary" }, { text: ` ${label}`, role: "text" }]];
  if (cancellable) rows.push([], [{ text: CANCEL_HINT, role: "dim" }]);
  return rows;
}

export function colorSegment(segment: Segment): string {
  if (process.env.FORCE_COLOR === "0" || (process.env.NO_COLOR && !process.env.FORCE_COLOR)) return segment.text;
  const rgb = [1, 3, 5].map(offset => parseInt(theme[segment.role].slice(offset, offset + 2), 16)).join(";");
  return `\x1b[38;2;${rgb}m${segment.text}\x1b[0m`;
}
