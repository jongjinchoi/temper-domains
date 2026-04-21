import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/temper-data";

const COMMON_RULE = {
  allow: "/",
  disallow: "/api/",
} as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", ...COMMON_RULE },
      // Explicit opt-in for AI answer engines — same policy as *, made
      // visible so the intent ("welcome AI indexing, minus the API")
      // is unambiguous and auditable.
      { userAgent: "GPTBot", ...COMMON_RULE },
      { userAgent: "ClaudeBot", ...COMMON_RULE },
      { userAgent: "Claude-Web", ...COMMON_RULE },
      { userAgent: "PerplexityBot", ...COMMON_RULE },
      { userAgent: "Google-Extended", ...COMMON_RULE },
      { userAgent: "CCBot", ...COMMON_RULE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
