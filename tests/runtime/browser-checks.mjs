import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const { openBrowser } = await import(pathToFileURL(process.argv[2]));
const url = 'https://example.invalid/domain';
const launcher = code => () => spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
await assert.rejects(openBrowser(url, { launch: () => spawn('/temper-test-command-does-not-exist', []) }), /ENOENT/);
await assert.rejects(openBrowser(url, { launch: () => { throw new Error('spawn failed'); } }), /spawn failed/);
await assert.rejects(openBrowser(url, { launch: launcher('process.exit(7)') }), /7/);
assert.deepEqual(await openBrowser(url, { launch: launcher('process.exit(0)') }), { kind: 'accepted', url });
assert.deepEqual(await openBrowser(url, { launch: launcher('setTimeout(() => process.exit(7), 150)'), timeoutMs: 20 }), { kind: 'unconfirmed', url });
// Late unsuccessful completion must not reject twice or emit an unhandled error.
await new Promise(resolve => setTimeout(resolve, 250));
