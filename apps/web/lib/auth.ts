import "server-only";
import { redirect } from "next/navigation";
import { env } from "./env";
import { readDevSession } from "./session";
import { supabaseServer } from "./supabase";

export interface User {
  id: string;
  email: string;
}

export async function currentUser(): Promise<User | null> {
  if (env().AUTH_DRIVER === "dev") return readDevSession();
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}

/** For pages/actions that require a signed-in user. */
export async function requireUser(locale = "sv"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}
