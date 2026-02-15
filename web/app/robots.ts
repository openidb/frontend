import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://openidb.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/config"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
