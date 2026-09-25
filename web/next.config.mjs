import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { websiteSourceUrl } from "../scripts/source-revision.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
);
const sourceUrl = websiteSourceUrl(resolve(__dirname, '..'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_TEMPER_VERSION: rootPkg.version,
    NEXT_PUBLIC_TEMPER_SOURCE_URL: sourceUrl ?? '',
  },
};

export default nextConfig;
