// Twitter Card reuses the same renderer as OpenGraph. Next.js requires the
// route-segment config (runtime, size, etc.) to be declared literally here
// — it can't be re-exported from opengraph-image.tsx.
import { SITE_TITLE } from "@/lib/temper-data";

export { default } from "./opengraph-image";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = SITE_TITLE;
