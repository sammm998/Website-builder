import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/hosts";

// Rendered per request: the public origin is only known at runtime (e.g. Railway's domain).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = appOrigin();
  return {
    rules: [{ userAgent: "*", allow: ["/sv", "/en"], disallow: ["/api/", "/preview/", "/sv/dashboard", "/en/dashboard", "/sv/projects", "/en/projects", "/sv/login", "/en/login"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
