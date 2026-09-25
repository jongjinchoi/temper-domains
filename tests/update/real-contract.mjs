import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function parseArguments(args) {
  const [channel, startVersion, targetVersion, brewSource, archive, expectedHash] = args;
  assert.ok(['npm', 'homebrew'].includes(channel), 'Choose npm or homebrew');
  assert.ok(stable.test(startVersion ?? '') && stable.test(targetVersion ?? ''), 'Explicit stable start and target versions are required');
  const before = startVersion.split('.').map(Number), after = targetVersion.split('.').map(Number);
  const first = before.findIndex((part, i) => part !== after[i]);
  assert.ok(first >= 0 && before[first] < after[first], 'Target must be newer than the test start version');
  assert.equal(args.length, channel === 'npm' ? 3 : 6, 'Unexpected or missing arguments');
  if (channel === 'homebrew') assert.ok(brewSource && archive && /^[a-f0-9]{64}$/.test(expectedHash ?? ''), 'Homebrew requires source, archive and SHA-256');
  return { channel, startVersion, targetVersion, brewSource, archive, expectedHash };
}
export function requireVersion(actual, expected, context) {
  assert.equal(actual, expected, `${context}: expected ${expected}, received ${actual}; refusing to change target`);
}
export function requireDigest(bytes, expected, algorithm = 'sha256', encoding = 'hex') {
  assert.equal(createHash(algorithm).update(bytes).digest(encoding), expected, 'Archive integrity mismatch');
}
