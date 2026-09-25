import { readFileSync, writeFileSync } from 'node:fs';
import { prepareSource, verifyNativeIdentity } from './source-package.ts';

const record = JSON.parse(readFileSync('dist/npm-build.json', 'utf8'));
const source = prepareSource(undefined, record.bun);
verifyNativeIdentity(record, source.manifest.snapshot, readFileSync('dist/npm/index.js'));
writeFileSync('dist/npm/SOURCE.md', source.description);
