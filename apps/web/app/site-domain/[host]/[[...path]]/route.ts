import { publishedByDomain, servePublished } from "@/lib/sites";

export const dynamic = "force-dynamic";

const NOT_CONNECTED = () => new Response("This domain is not connected to a published site.", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ host: string; path?: string[] }> }) {
  const { host, path } = await params;
  // An unknown host must never surface as a 500 (e.g. before the database is configured).
  if (!process.env["DATABASE_URL"]) return NOT_CONNECTED();
  const site = await publishedByDomain(host).catch((err: unknown) => {
    console.error("site-domain lookup failed", err);
    return null;
  });
  if (!site) return NOT_CONNECTED();
  return servePublished(site, (path ?? []).join("/"));
}
