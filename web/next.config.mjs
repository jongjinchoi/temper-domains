import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_TEMPER_VERSION: rootPkg.version,
  },
};

export default nextConfig;
