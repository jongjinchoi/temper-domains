import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Past demo names that were fully replaced by `localhoston`. If any slip
// back into the source tree (website, SVG banners, README), this test
// fails — catches the class of bug where an asset (like the old
// og-image.png) silently kept a dashflow reference while the site moved on.

const STALE_DEMO_NAMES = ["dashflow", "havenforge", "calmbox", "wellbi"];

const REPO_ROOT = join(import.meta.dir, "../../..");

const SCAN_DIRS = [
  join(REPO_ROOT, "web"),
  join(REPO_ROOT, "assets/logo/header"),
];

const SCAN_EXTS = new Set([".ts", ".tsx", ".css", ".svg", ".md", ".mjs"]);
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  "out",
  "__tests__", // skip this file itself
]);

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walkFiles(full);
    } else {
      const dot = entry.lastIndexOf(".");
      if (dot >= 0 && SCAN_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

describe("no stale demo-name refs", () => {
  for (const stale of STALE_DEMO_NAMES) {
    test(`"${stale}" is absent from web/ and assets/logo/header/`, () => {
      const hits: string[] = [];
      for (const dir of SCAN_DIRS) {
        for (const file of walkFiles(dir)) {
          const text = readFileSync(file, "utf-8");
          if (text.includes(stale)) hits.push(file);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
