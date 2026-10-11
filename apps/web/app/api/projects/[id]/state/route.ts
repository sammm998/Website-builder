import { currentUser } from "@/lib/auth";
import { wizardState } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const state = await wizardState(user.id, (await params).id);
  if (!state) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}
