import { expect, test } from 'bun:test';
import { validateLinks, validateLicenseLabels } from './documentation.ts';

test('documentation checks follow local and repository links including anchors', () => {
  const pages = new Map([
    ['README.md', '[CLI](docs/cli.md#all-options) [MCP](https://github.com/jongjinchoi/temper-domains/blob/main/docs/mcp.md#tools)'],
    ['docs/cli.md', '# CLI\n## All options\n[Home](../README.md)'],
    ['docs/mcp.md', '# MCP\n<a id="tools"></a>'],
  ]);
  expect(() => validateLinks(pages, path => pages.has(path))).not.toThrow();
  pages.set('docs/cli.md', '# CLI\n## All options\n[Missing](missing.md)');
  expect(() => validateLinks(pages, path => pages.has(path))).toThrow('missing.md');
  pages.set('docs/cli.md', '# CLI');
  expect(() => validateLinks(pages, path => pages.has(path))).toThrow('all-options');
});

test('current license labels cannot silently disagree with the package', () => {
  expect(() => validateLicenseLabels('AGPL-3.0-only', new Map([['README.md', 'GNU AGPL 3.0 only']]))).not.toThrow();
  expect(() => validateLicenseLabels('Apache-2.0', new Map())).toThrow();
  expect(() => validateLicenseLabels('AGPL-3.0-only', new Map([['Hero.tsx', 'Apache 2.0']]))).toThrow('Hero.tsx');
  expect(() => validateLicenseLabels('AGPL-3.0-only', new Map([['README.md', 'AGPL-3.0-only'], ['Footer.tsx', 'Open source']]))).not.toThrow();
  expect(() => validateLicenseLabels('AGPL-3.0-only', new Map([['README.md', 'Open source']]))).toThrow('README.md');
});
