import { publishedByDomain, servePublished } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ host: string; path?: string[] }> }) {
  const { host, path } = await params;
  const site = await publishedByDomain(host);
  if (!site) return new Response("This domain is not connected to a published site.", { status: 404 });
  return servePublished(site, (path ?? []).join("/"));
}
