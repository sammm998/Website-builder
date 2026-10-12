import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/hosts";

// Rendered per request: the public origin is only known at runtime (e.g. Railway's domain).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  return ["sv", "en"].map((l) => ({
    url: `${origin}/${l}`,
    changeFrequency: "weekly",
    priority: 1,
    alternates: { languages: { sv: `${origin}/sv`, en: `${origin}/en` } },
  }));
}
