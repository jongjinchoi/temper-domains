import { digest, type CaptureManifest } from './media/core.ts';
import { basename } from 'node:path';

export type DocumentationManifest = CaptureManifest & { packageSource?: string };

function packageForComparison(source: string) {
  const pkg = JSON.parse(source);
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || typeof pkg.version !== 'string' || !pkg.version) {
    throw new Error('Expected a package object with a version string');
  }
  return pkg;
}

// These files contain documentation/notices only and are not imported by the CLI.
const DOCUMENTATION_ADDITIONS = new Set([
  'SOURCE.md', 'THIRD_PARTY_NOTICES.md', 'docs/cli.md', 'docs/extensions.md',
  'docs/troubleshooting.md', 'docs/mcp.md', 'docs/licensing.md',
  'docs/current.md', 'docs/release.md', 'docs/backlog.md',
]);

export function manifestForCurrentPackage(manifest: DocumentationManifest, currentPackage: string): CaptureManifest {
  if (typeof manifest.packageSource !== 'string') throw new Error('Missing capture package source; run scripts/docs.ts --record-package before changing the package');
  recordPackageSource(manifest, manifest.packageSource);
  const original = packageForComparison(manifest.packageSource);
  const current = packageForComparison(currentPackage);
  delete original.version;
  delete current.version;
  if (original.license === 'Apache-2.0' && current.license === 'AGPL-3.0-only') current.license = original.license;
  if (Array.isArray(original.files) && Array.isArray(current.files)) {
    current.files = current.files.filter((path: unknown) => original.files.includes(path)
      || typeof path !== 'string' || !DOCUMENTATION_ADDITIONS.has(path));
  }
  if (JSON.stringify(original) !== JSON.stringify(current)) {
    throw new Error('Package contents beyond approved display-neutral metadata changed; review their effect on recorded screens');
  }
  // Only the in-memory comparison changes. Original provenance remains intact.
  // The current tapes do not display version/license/package file lists and disable update checks.
  return { ...manifest, inputs: { ...manifest.inputs, 'package.json': digest(currentPackage) } };
}

export function recordPackageSource(manifest: DocumentationManifest, source: string): DocumentationManifest {
  if (digest(source) !== manifest.inputs['package.json']) throw new Error('Package source does not match the original capture hash');
  packageForComparison(source);
  const executable = manifest.runtime.bunExecutable;
  const entry = manifest.runtime.entry?.replaceAll('\\', '/');
  if (!executable || (entry !== 'src/index.ts' && !entry?.endsWith('/src/index.ts'))) throw new Error('Unexpected capture runtime paths');
  // Publish portable identifiers while retaining the capture time and all input/output hashes.
  return {
    ...manifest,
    runtime: { ...manifest.runtime, bunExecutable: basename(executable.replaceAll('\\', '/')), entry: 'src/index.ts' },
    packageSource: source,
  };
}
