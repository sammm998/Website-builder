import { setupStatus } from "@/lib/setup";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics: which variables are missing (names only, never values), whether the database
 * is reachable and migrated, and worker heartbeats. 200 when the app can serve signed-in users, else 503.
 */
export async function GET(req: Request) {
  // Liveness for the platform's deploy healthcheck: the server is up, configuration is reported below.
  if (new URL(req.url).searchParams.has("live")) return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const status = await setupStatus();
  const workers = status.workers.map(({ state, missing, ai_ready, seen_at, fresh }) => ({ state, missing, ai_ready, seen_at, fresh }));
  return Response.json(
    { ...status, workers, setup: "/sv/setup", docs: "docs/railway.md" },
    { status: status.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
