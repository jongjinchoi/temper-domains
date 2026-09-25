// Render recorded real PTY bytes. This is a replay, never an installation test.
// Optional stage stops at an actual recorded frame for visual inspection.
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const [file, stage] = process.argv.slice(2);
const [header, ...events] = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);
if (header.version !== 2) throw new Error("Expected an asciicast v2 recording");
const marker = { choice: "Enter confirm", updating: "Ctrl+C to cancel", verifying: "Verifying installation", warning: "Run brew doctor" }[stage];
if (stage && stage !== "complete" && !marker) throw new Error("Unknown stage");
process.stdout.write("\x1b[2J\x1b[H");
let previous = 0;
let found = false;
for (const [time, kind, text] of events) {
  if (kind !== "o") continue;
  if (!stage) await setTimeout(Math.max(0, (time - previous) * 1000));
  previous = time;
  process.stdout.write(text);
  if (marker && text.includes(marker)) { found = true; break; }
}
if (marker && !found) throw new Error(`Stage was not recorded: ${stage}`);
// Hold the replay screen for a screenshot; no product delay or invented frame.
if (stage) await setTimeout(3000);
