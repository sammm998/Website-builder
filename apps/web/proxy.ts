import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  const appHost = new URL(process.env["APP_ORIGIN"] ?? "http://localhost:3000").hostname;
  const sitesDomain = (process.env["SITES_DOMAIN"] ?? "").toLowerCase();
  const { pathname, search } = req.nextUrl;

  if (sitesDomain && host.endsWith(`.${sitesDomain}`)) {
    const slug = host.slice(0, -(sitesDomain.length + 1));
    return NextResponse.rewrite(new URL(`/site/${slug}${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  const isAppHost = host === appHost || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  if (!isAppHost && host) {
    return NextResponse.rewrite(new URL(`/site-domain/${host}${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  if (BYPASS.test(pathname)) return NextResponse.next();
  if (!/^\/(sv|en)(\/|$)/.test(pathname)) {
    return NextResponse.redirect(new URL(`/${preferredLocale(req)}${pathname === "/" ? "" : pathname}${search}`, req.url));
  }

  const res = NextResponse.next();
  if (process.env["AUTH_DRIVER"] !== "dev" && process.env["NEXT_PUBLIC_SUPABASE_URL"] && process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
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
