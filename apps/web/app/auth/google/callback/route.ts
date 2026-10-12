import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { finishGoogle } from "@/lib/google-oauth";
import { upsertGoogleUser } from "@/lib/password-auth";
import { createSession, takeOAuthState } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Google redirects here with ?code&state; verify, find or create the user, set the session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = env().APP_ORIGIN;
  const saved = await takeOAuthState();
  const locale = saved?.["locale"] ?? "sv";
  const fail = () => NextResponse.redirect(`${origin}/${locale}/login?error=oauth`);
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved["state"]) return fail();
  try {
    const identity = await finishGoogle(code, saved["verifier"]!, saved["nonce"]!);
    const user = await upsertGoogleUser(identity);
    await createSession(user.id, user.email);
  } catch (error) {
    console.error("google sign-in failed", error);
    return fail();
  }
  return NextResponse.redirect(`${origin}${saved["next"] ?? `/${locale}/dashboard`}`);
}
