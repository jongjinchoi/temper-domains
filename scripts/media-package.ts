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

export function recordPackageSource(manifest: DocumentationManifest, source: string): DocumentationManifest {
  if (typeof source !== 'string') throw new Error('Missing original capture package source');
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
