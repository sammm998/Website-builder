import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAppHost, sitesSubdomainSlug } from "./lib/hosts";

const BYPASS = /^\/(api|site|site-domain|preview|runtime|fonts|storage|_next|auth)(\/|$)|\.[a-z0-9]{2,5}$/i;

function preferredLocale(req: NextRequest): "sv" | "en" {
  const header = req.headers.get("accept-language") ?? "";
  return /^\s*(sv|nb|no|da)/i.test(header) || header === "" ? "sv" : "en";
}

/**
 * Host routing (published sites on <slug>.<SITES_DOMAIN> and verified custom domains), locale
 * prefixes for the app and Supabase session refresh.
 */
export async function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  const { pathname, search } = req.nextUrl;

  const slug = sitesSubdomainSlug(host);
  if (slug) {
    return NextResponse.rewrite(new URL(`/site/${slug}${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  if (!isAppHost(host)) {
    return NextResponse.rewrite(new URL(`/site-domain/${host}${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  if (BYPASS.test(pathname)) return NextResponse.next();
  if (!/^\/(sv|en)(\/|$)/.test(pathname)) {
    // Build the redirect from the public host (req.url can be the internal address behind a proxy).
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.nextUrl.protocol.replace(":", "");
    const base = host ? `${proto}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}` : req.url;
    return NextResponse.redirect(new URL(`/${preferredLocale(req)}${pathname === "/" ? "" : pathname}${search}`, base));
  }

  const res = NextResponse.next();
  const supabaseAuth = (process.env["AUTH_DRIVER"] || (process.env["NEXT_PUBLIC_SUPABASE_URL"] ? "supabase" : "password")) === "supabase";
  if (supabaseAuth && process.env["NEXT_PUBLIC_SUPABASE_URL"] && process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const supabase = createServerClient(process.env["NEXT_PUBLIC_SUPABASE_URL"], process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    await supabase.auth.getUser();
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
