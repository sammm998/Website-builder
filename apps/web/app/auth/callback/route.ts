import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/** OAuth / magic-link callback: exchanges the code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/sv/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/sv/dashboard";
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
