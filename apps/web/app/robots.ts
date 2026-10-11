import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env["APP_ORIGIN"] ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/sv", "/en"], disallow: ["/api/", "/preview/", "/sv/dashboard", "/en/dashboard", "/sv/projects", "/en/projects", "/sv/login", "/en/login"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
