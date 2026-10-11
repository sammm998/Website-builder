import { env } from "@/lib/env";
import { contentTypeFor, readObject } from "@/lib/storage";

/** Local storage driver: public site media (Supabase serves these directly in production). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (env().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const [bucket, ...rest] = (await params).path;
  if (bucket !== "site-media") return new Response("Forbidden", { status: 403 });
  const path = rest.join("/");
  const body = await readObject("site-media", path);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { "content-type": contentTypeFor(path), "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*", "cross-origin-resource-policy": "cross-origin" },
  });
}
