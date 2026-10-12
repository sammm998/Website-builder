import { env } from "@/lib/env";
import { contentTypeFor, readObject } from "@/lib/storage";

/** Public site media for the local and S3 drivers (the bucket itself stays private). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const driver = env().STORAGE_DRIVER;
  if (driver !== "local" && driver !== "s3") return new Response("Not found", { status: 404 });
  const [bucket, ...rest] = (await params).path;
  // Only site-media is public; screenshots are served to their owner via /api/screens.
  if (bucket !== "site-media") return new Response("Forbidden", { status: 403 });
  const path = rest.join("/");
  const body = await readObject("site-media", path);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": contentTypeFor(path),
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
