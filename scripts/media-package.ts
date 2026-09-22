import { digest, type CaptureManifest } from './media/core.ts';

export type DocumentationManifest = CaptureManifest & { packageSource?: string };

function withoutVersion(source: string) {
  const pkg = JSON.parse(source);
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || typeof pkg.version !== 'string' || !pkg.version) {
    throw new Error('Expected a package object with a version string');
  }
  delete pkg.version;
  return JSON.stringify(pkg);
}

export function manifestForCurrentPackage(manifest: DocumentationManifest, currentPackage: string): CaptureManifest {
  if (typeof manifest.packageSource !== 'string') throw new Error('Missing capture package source; run scripts/docs.ts --record-package before changing the package');
  recordPackageSource(manifest, manifest.packageSource);
  if (withoutVersion(manifest.packageSource) !== withoutVersion(currentPackage)) {
    throw new Error('Package contents other than version changed; review their effect on recorded screens');
  }
  // Only the in-memory comparison changes. Original provenance remains intact.
  // The current tapes do not display the version and disable update checks.
  return { ...manifest, inputs: { ...manifest.inputs, 'package.json': digest(currentPackage) } };
}

export function recordPackageSource(manifest: DocumentationManifest, source: string): DocumentationManifest {
  if (digest(source) !== manifest.inputs['package.json']) throw new Error('Package source does not match the original capture hash');
  withoutVersion(source);
  return { ...manifest, packageSource: source };
}
