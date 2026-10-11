import { currentUser } from "@/lib/auth";
import { ownsScreen } from "@/lib/repo";
import { contentTypeFor, readObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Private screenshots (owner only). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const path = (await params).path.map(decodeURIComponent).join("/");
  if (!ownsScreen(user.id, path)) return new Response("Forbidden", { status: 403 });
  const body = await readObject("screens", path);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), { headers: { "content-type": contentTypeFor(path), "cache-control": "private, max-age=86400" } });
}
