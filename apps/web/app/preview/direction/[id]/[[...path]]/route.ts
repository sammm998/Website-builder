import { currentUser } from "@/lib/auth";
import { previewResponse, renderDirectionPreview } from "@/lib/sites";

export const dynamic = "force-dynamic";

/** Owner's preview of a design direction (iframe or new tab); every path shows its homepage. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const html = await renderDirectionPreview(user.id, id);
  if (!html) return new Response("Not found", { status: 404 });
  return previewResponse(html);
}
