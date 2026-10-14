"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { currentUser, requireConfigured } from "@/lib/auth";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { isLocale, localizeError, type Locale } from "@/lib/i18n";
import * as repo from "@/lib/repo";
import { addDomain, removeDomain, verifyDomain } from "@/lib/domains";
import { saveAnthropicKey } from "@/lib/ai-key";
import { createShare, type ShareKind } from "@/lib/shares";
import { signIn, signUp } from "@/lib/password-auth";
import { clearSession, createSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

async function user() {
  const u = await currentUser();
  if (!u) throw new repo.UserError("Please log in again.");
  return u;
}

/** UI language of the page that called the action (actions do not all receive the locale). */
async function callerLocale(): Promise<Locale> {
  const referer = (await headers()).get("referer") ?? "";
  try {
    return new URL(referer).pathname.startsWith("/en") ? "en" : "sv";
  } catch {
    return "sv";
  }
}

async function failure(message: string): Promise<ActionResult> {
  return { ok: false, error: localizeError(message, await callerLocale()) };
}

async function fail(error: unknown): Promise<ActionResult> {
  if (error instanceof repo.UserError) return failure(error.message);
  if (error instanceof z.ZodError) return failure(error.issues[0]?.message ?? "Invalid input.");
  console.error(error);
  return failure("Something went wrong. Please try again.");
}

async function run(fn: () => Promise<void | string>): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, ...(message ? { message } : {}) };
  } catch (error) {
    return fail(error);
  }
}

function safeNext(v: FormDataEntryValue | null, locale: Locale): string {
  const next = typeof v === "string" ? v : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : `/${locale}/dashboard`;
}

const loc = (v: FormDataEntryValue | null): Locale => (typeof v === "string" && isLocale(v) ? v : "sv");

// --- Auth -----------------------------------------------------------------------------------

export async function loginAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = loc(form.get("locale"));
  requireConfigured(locale);
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return failure("Enter a valid email address.");
  const mode = String(form.get("mode") ?? "password");
  const driver = env().AUTH_DRIVER;
  if (driver === "dev") {
    const db = sql();
    const [existing] = await db<{ id: string }[]>`select id from auth.users where lower(email) = ${email.data}`;
    const id = existing?.id ?? (await db<{ id: string }[]>`insert into auth.users (email) values (${email.data}) returning id`)[0]!.id;
    await createSession(id, email.data);
    redirect(safeNext(form.get("next"), locale));
  }
  const password = String(form.get("password") ?? "");
  if (driver === "password") {
    try {
      const u = mode === "signup" ? await signUp(email.data, password) : await signIn(email.data, password);
      await createSession(u.id, u.email);
    } catch (error) {
      return fail(error);
    }
    redirect(safeNext(form.get("next"), locale));
  }
  const supabase = await supabaseServer();
  const origin = env().APP_ORIGIN;
  if (mode === "magic") {
    const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: `${origin}/auth/callback?next=/${locale}/dashboard` } });
    return error ? { ok: false, error: error.message } : { ok: true, message: "sent" };
  }
  if (password.length < 8) return failure("Password must be at least 8 characters.");
  if (mode === "signup") {
    const { error } = await supabase.auth.signUp({ email: email.data, password, options: { emailRedirectTo: `${origin}/auth/callback?next=/${locale}/dashboard` } });
    return error ? { ok: false, error: error.message } : { ok: true, message: "sent" };
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) return { ok: false, error: error.message };
  redirect(safeNext(form.get("next"), locale));
}

export async function googleLoginAction(form: FormData) {
  const locale = loc(form.get("locale"));
  const next = safeNext(form.get("next"), locale);
  if (env().AUTH_DRIVER === "password") redirect(`/auth/google?${new URLSearchParams({ locale, next })}`);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env().APP_ORIGIN}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/${locale}/login?error=oauth`);
  redirect(data.url);
}

export async function logoutAction(form: FormData) {
  const locale = loc(form.get("locale"));
  if (env().AUTH_DRIVER === "supabase") await (await supabaseServer()).auth.signOut();
  else await clearSession();
  redirect(`/${locale}`);
}

// --- Projects -------------------------------------------------------------------------------

export async function createProjectAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = loc(form.get("locale"));
  requireConfigured(locale);
  let id: string;
  try {
    const u = await user();
    id = await repo.createProject(u.id, {
      url: String(form.get("url") ?? ""),
      inspiration: form.getAll("inspiration").map(String).filter((v) => v.trim()),
      languages: form.getAll("languages").map(String),
    });
  } catch (error) {
    return fail(error);
  }
  redirect(`/${locale}/projects/${id}`);
}

/** Landing page URL field: remembers the URL and sends the visitor to sign-in or the new project form. */
export async function startFromLandingAction(form: FormData) {
  const locale = loc(form.get("locale"));
  requireConfigured(locale);
  const url = String(form.get("url") ?? "").trim().slice(0, 500);
  const target = `/${locale}/projects/new${url ? `?url=${encodeURIComponent(url)}` : ""}`;
  const u = await currentUser();
  redirect(u ? target : `/${locale}/login?next=${encodeURIComponent(target)}`);
}

export async function deleteProjectAction(form: FormData) {
  const u = await user();
  await repo.deleteProject(u.id, String(form.get("projectId")));
  revalidatePath(`/${loc(form.get("locale"))}/dashboard`);
}

export async function togglePageAction(pageId: string, included: boolean) {
  return run(async () => repo.setPageIncluded((await user()).id, pageId, included));
}

export async function toggleAllPagesAction(projectId: string, included: boolean) {
  return run(async () => repo.setAllPagesIncluded((await user()).id, projectId, included));
}

export async function startAnalysisAction(projectId: string, locale: string) {
  return run(async () => repo.startAnalysis((await user()).id, projectId, isLocale(locale) ? locale : "sv"));
}

export async function updateAnalysisAction(projectId: string, summary: unknown) {
  return run(async () => repo.updateAnalysis((await user()).id, projectId, summary));
}

export async function approveAnalysisAction(projectId: string) {
  return run(async () => repo.approveAnalysis((await user()).id, projectId));
}

export async function regenerateDirectionAction(projectId: string, slot: number, feedback: string) {
  return run(async () => repo.regenerateDirection((await user()).id, projectId, slot, feedback));
}

export async function approveDirectionAction(projectId: string, directionId: string) {
  return run(async () => repo.approveDirection((await user()).id, projectId, directionId));
}

export async function rebuildAction(projectId: string) {
  return run(async () => repo.rebuild((await user()).id, projectId));
}

export async function publishAction(projectId: string, slug: string) {
  return run(async () => repo.publish((await user()).id, projectId, slug));
}

export async function unpublishAction(projectId: string) {
  return run(async () => repo.unpublish((await user()).id, projectId));
}

export async function resumeJobAction(jobId: string) {
  return run(async () => repo.resumeJob((await user()).id, jobId));
}

export async function cancelJobAction(jobId: string) {
  return run(async () => repo.cancelJob((await user()).id, jobId));
}

export async function addDomainAction(projectId: string, hostname: string) {
  return run(async () => addDomain((await user()).id, projectId, hostname));
}

export async function verifyDomainAction(domainId: string) {
  return run(async () => ((await verifyDomain((await user()).id, domainId)) ? "verified" : "pending"));
}

export async function removeDomainAction(domainId: string) {
  return run(async () => removeDomain((await user()).id, domainId));
}

export async function requestOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// --- Installation settings ------------------------------------------------------------------

export async function saveAnthropicKeyAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const result = await saveAnthropicKey((await user()).id, String(form.get("key") ?? ""));
    revalidatePath("/[locale]/setup", "page");
    return result;
  });
}

// --- Test links -----------------------------------------------------------------------------

/** Creates (or reuses) a 7-day test link for the owner's direction or build; returns its URL. */
export async function createPreviewShareAction(kind: ShareKind, targetId: string): Promise<ActionResult> {
  return run(async () => {
    if (kind !== "direction" && kind !== "build") throw new repo.UserError("Preview not found.");
    const { token } = await createShare((await user()).id, kind, targetId);
    return `${env().APP_ORIGIN}/p/${token}`;
  });
}
