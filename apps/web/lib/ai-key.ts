import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_KEY_SETTING, decryptSetting, encryptSetting } from "@redesign/ai/secrets";
import { sql } from "./db";
import { UserError } from "./repo";

/** The Claude key the owner entered in the app (stored encrypted in app_settings). */
export interface AiKeyStatus {
  /** Where the worker gets a key from: its environment, the app, or nowhere yet. */
  source: "env" | "app" | null;
  last4: string | null;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await sql()<{ ok: boolean }[]>`select exists (select 1 from user_roles where user_id = ${userId} and role = 'admin') as ok`;
  return !!row?.ok;
}

export async function hasAdmin(): Promise<boolean> {
  const [row] = await sql()<{ ok: boolean }[]>`select exists (select 1 from user_roles where role = 'admin') as ok`;
  return !!row?.ok;
}

export async function aiKeyStatus(workerHasKey: boolean): Promise<AiKeyStatus> {
  const [row] = await sql()<{ value: string }[]>`select value from app_settings where key = ${ANTHROPIC_KEY_SETTING}`;
  const key = row ? decryptSetting(row.value) : null;
  if (key) return { source: "app", last4: key.slice(-4) };
  return { source: workerHasKey ? "env" : null, last4: null };
}

/** Checks the key against the API (list models) and stores it encrypted. Admins only. */
export async function saveAnthropicKey(userId: string, raw: string): Promise<"verified" | "unverified"> {
  if (!(await isAdmin(userId))) {
    // Accounts created before roles were claimed: the first one to set up the installation becomes admin.
    const [claimed] = await sql()<{ user_id: string }[]>`
      insert into user_roles (user_id, role) select ${userId}, 'admin' where not exists (select 1 from user_roles where role = 'admin')
      on conflict do nothing returning user_id`;
    if (!claimed) throw new UserError("Only the administrator can change this.");
  }
  const key = raw.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new UserError("That does not look like an Anthropic API key (sk-ant-…).");
  let result: "verified" | "unverified" = "verified";
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new UserError("Anthropic did not accept the key. Check that it is copied completely.");
    }
    // Network trouble or an API hiccup: keep the key; the first job will tell if it is wrong.
    console.error("anthropic key check failed", (error as Error).message);
    result = "unverified";
  }
  await sql()`
    insert into app_settings (key, value, updated_at) values (${ANTHROPIC_KEY_SETTING}, ${encryptSetting(key)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return result;
}
