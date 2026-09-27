import { readFileSync, writeFileSync } from 'node:fs';
import { prepareSource } from './source-package.ts';
import { verifyNpmIdentity } from './npm-build-record.ts';

const record = JSON.parse(readFileSync('dist/npm-build.json', 'utf8'));
const source = prepareSource(undefined, record.bun);
verifyNpmIdentity(record, source.manifest.snapshot, 'dist/npm');
writeFileSync('dist/npm/SOURCE.md', source.description);
