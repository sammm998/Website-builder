import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env["APP_ORIGIN"] ?? "http://localhost:3000";
  return ["sv", "en"].map((l) => ({
    url: `${origin}/${l}`,
    changeFrequency: "weekly",
    priority: 1,
    alternates: { languages: { sv: `${origin}/sv`, en: `${origin}/en` } },
  }));
}
