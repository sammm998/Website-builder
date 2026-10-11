import { currentUser } from "@/lib/auth";
import { htmlResponse, renderBuildPreview, siteCsp } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ buildId: string; path?: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { buildId, path } = await params;
  const html = await renderBuildPreview(user.id, buildId, `/${(path ?? []).join("/")}`);
  if (!html) return new Response("Not found", { status: 404 });
  return htmlResponse(html, siteCsp({ preview: true, selfStyles: false }), { "cache-control": "private, no-store", "x-robots-tag": "noindex" });
}
