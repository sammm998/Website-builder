import { currentUser } from "@/lib/auth";
import { previewResponse, renderBuildPreview } from "@/lib/sites";

export const dynamic = "force-dynamic";

/** Owner's preview of a finished build (iframe or new tab), navigable between its pages. */
export async function GET(_req: Request, { params }: { params: Promise<{ buildId: string; path?: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { buildId, path } = await params;
  const page = await renderBuildPreview(user.id, buildId, `/${(path ?? []).join("/")}`);
  if (!page) return new Response("Not found", { status: 404 });
  return previewResponse(page.html, page.status);
}
