import "server-only";
import { redirect } from "next/navigation";
import { env } from "./env";
import { readSession } from "./session";
import { isConfigured } from "./setup";
import { supabaseServer } from "./supabase";

export interface User {
  id: string;
  email: string;
}

export async function currentUser(): Promise<User | null> {
  // Before the deployment is configured nobody can be signed in; pages send visitors to /setup.
  if (!isConfigured()) return null;
  if (env().AUTH_DRIVER !== "supabase") return readSession();
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

/** For pages/actions that require a signed-in user. */
export async function requireUser(locale = "sv"): Promise<User> {
  requireConfigured(locale);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

/** Sends visitors to the setup guide instead of failing while variables (e.g. DATABASE_URL) are missing. */
export function requireConfigured(locale = "sv") {
  if (!isConfigured()) redirect(`/${locale}/setup`);
}
