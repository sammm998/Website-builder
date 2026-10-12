import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { googleConfigured, startGoogle } from "@/lib/google-oauth";
import { isLocale } from "@/lib/i18n";
import { setOAuthState } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts Google sign-in (password driver). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLocale = url.searchParams.get("locale") ?? "sv";
  const locale = isLocale(rawLocale) ? rawLocale : "sv";
  const next = url.searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : `/${locale}/dashboard`;
  const origin = env().APP_ORIGIN;
  if (env().AUTH_DRIVER !== "password" || !googleConfigured()) return NextResponse.redirect(`${origin}/${locale}/login?error=oauth`);
  const { url: target, state, verifier, nonce } = startGoogle();
  await setOAuthState({ state, verifier, nonce, next: safeNext, locale });
  return NextResponse.redirect(target);
}
