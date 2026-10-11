import { publishedBySlug, servePublished } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path } = await params;
  const site = await publishedBySlug(slug);
  if (!site) return new Response("Not found", { status: 404 });
  return servePublished(site, (path ?? []).join("/"));
}
