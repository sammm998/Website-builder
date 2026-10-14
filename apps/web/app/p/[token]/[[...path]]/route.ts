import { isConfigured } from "@/lib/setup";
import { resolveShare } from "@/lib/shares";
import { previewResponse, renderBuildPreview, renderDirectionPreview } from "@/lib/sites";

export const dynamic = "force-dynamic";

const page = (title: string, text: string, status: number) =>
  new Response(
    `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f3ec;color:#0f0f0d"><main style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.6rem">${title}</h1><p>${text}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );

/** Test link for an unpublished preview: viewable without logging in until it expires. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  if (!isConfigured()) return page("Länken fungerar inte just nu", "Försök igen om en stund.", 503);
  const { token, path } = await params;
  const share = await resolveShare(token);
  if (share === "expired") return page("Testlänken har gått ut", "Be om en ny länk från den som skickade den.", 410);
  if (!share) return page("Länken finns inte", "Kontrollera att hela länken är kopierad.", 404);
  const basePath = `/p/${token}`;
  if (share.kind === "direction") {
    const html = await renderDirectionPreview(share.user_id, share.target_id, basePath);
    return html ? previewResponse(html) : page("Förhandsvisningen finns inte längre", "Den kan ha tagits bort.", 404);
  }
  const rendered = await renderBuildPreview(share.user_id, share.target_id, `/${(path ?? []).join("/")}`, basePath);
  return rendered ? previewResponse(rendered.html, rendered.status) : page("Förhandsvisningen finns inte längre", "Den kan ha tagits bort.", 404);
}
