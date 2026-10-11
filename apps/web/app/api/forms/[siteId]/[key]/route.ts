import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const page = (title: string, text: string, back: string) =>
  `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f3ec;color:#0f0f0d"><main style="max-width:32rem;padding:2rem;text-align:center"><h1 style="font-size:2rem">${title}</h1><p>${text}</p><p><a href="${back}" style="color:inherit">←</a></p></main></body></html>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Receives form posts from published sites: honeypot, rate limit, size limits, stored per site. */
export async function POST(req: Request, { params }: { params: Promise<{ siteId: string; key: string }> }) {
  const { siteId, key } = await params;
  if (!/^[0-9a-f-]{36}$/.test(siteId) || !/^[a-z0-9-]{1,64}$/.test(key)) return new Response("Bad request", { status: 400 });
  const db = sql();
  const [site] = await db<{ id: string; origin: string; base_path: string; user_id: string; site_name: string }[]>`
    select id, origin, base_path, user_id, site_name from published_sites where id = ${siteId} and is_published`;
  if (!site) return new Response("Not found", { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Bad request", { status: 400 });
  const back = `${site.origin}${site.base_path}${String(form.get("_page") ?? "/")}`.replace(/[<>"]/g, "");
  if (String(form.get("_hp") ?? "") !== "") return new Response(page("Tack!", "", back), { headers: { "content-type": "text/html; charset=utf-8" } });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(`${ip}:${siteId}`).digest("hex").slice(0, 32);
  const n = (await db<{ n: number }[]>`select count(*)::int as n from form_submissions where site_id = ${siteId} and ip_hash = ${ipHash} and created_at > now() - interval '10 minutes'`)[0]?.n ?? 0;
  if (n >= 5) return new Response(page("För många försök", "Försök igen om en stund.", back), { status: 429, headers: { "content-type": "text/html; charset=utf-8" } });
  const data: Record<string, string> = {};
  let fields = 0;
  for (const [name, value] of form.entries()) {
    if (name.startsWith("_") || typeof value !== "string") continue;
    if (++fields > 40) break;
    data[name.slice(0, 64)] = value.slice(0, 5000);
  }
  await db`insert into form_submissions (site_id, form_key, page_path, data, ip_hash) values (${siteId}, ${key}, ${String(form.get("_page") ?? "/").slice(0, 500)}, ${db.json(data)}, ${ipHash})`;
  const e = env();
  if (e.RESEND_API_KEY) {
    const [owner] = await db<{ email: string | null }[]>`select email from auth.users where id = ${site.user_id}`;
    if (owner?.email) {
      const body = Object.entries(data).map(([k, v]) => `<p><strong>${esc(k)}</strong><br>${esc(v).replace(/\n/g, "<br>")}</p>`).join("");
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: e.FORMS_FROM_EMAIL, to: owner.email, subject: `Nytt formulärsvar – ${site.site_name}`, html: body }),
      }).catch(() => {});
    }
  }
  const sv = String(form.get("_lang") ?? "sv") === "sv";
  return new Response(page(sv ? "Tack!" : "Thank you!", sv ? "Ditt meddelande har skickats." : "Your message has been sent.", back), {
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
