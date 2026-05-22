import { createRequire } from "node:module";

declare const PKG_VERSION: string;

function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version?: unknown };
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error("package.json version is missing");
  }
  return pkg.version;
}

export const VERSION = typeof PKG_VERSION !== "undefined" ? PKG_VERSION : readPackageVersion();
