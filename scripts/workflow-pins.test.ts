import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Tags can move; a full commit SHA is the only immutable action reference.
// Update pins by resolving the intended tag in the action's official repository.
test("every workflow pins each action to one full commit SHA with its version comment", () => {
  const directory = resolve(import.meta.dir, "../.github/workflows");
  const pins = new Map<string, Set<string>>();
  const invalid: string[] = [];
  for (const name of readdirSync(directory).filter(file => /\.ya?ml$/.test(file)).sort()) {
    readFileSync(join(directory, name), "utf8").split("\n").forEach((line, index) => {
      const uses = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/.exec(line)?.[1];
      if (!uses) return;
      const pin = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40}) # v\d+(?:\.\d+){0,2}$/.exec(uses);
      if (!pin) { invalid.push(`${name}:${index + 1} ${uses}`); return; }
      pins.set(pin[1]!, (pins.get(pin[1]!) ?? new Set()).add(pin[2]!));
    });
  }
  expect(invalid).toEqual([]);
  expect(pins.size).toBeGreaterThan(0);
  expect([...pins].filter(([, shas]) => shas.size > 1).map(([action]) => action)).toEqual([]);
});
