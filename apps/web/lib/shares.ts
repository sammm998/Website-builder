import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { UserError } from "./repo";

/** Test links for unpublished previews: anyone with the link can view it until it expires. */
export const SHARE_DAYS = 7;

export type ShareKind = "direction" | "build";

export interface Share {
  token: string;
  user_id: string;
  kind: ShareKind;
  target_id: string;
  expires_at: Date;
}

/** Returns a valid link for the owner's direction or build, reusing one that is still valid for a day. */
export async function createShare(userId: string, kind: ShareKind, targetId: string): Promise<{ token: string; expiresAt: Date }> {
  const db = sql();
  const table = kind === "direction" ? db`design_directions` : db`site_builds`;
  const [target] = await db<{ project_id: string }[]>`select project_id from ${table} where id = ${targetId} and user_id = ${userId}`;
  if (!target) throw new UserError("Preview not found.");
  const [existing] = await db<{ token: string; expires_at: Date }[]>`
    select token, expires_at from preview_shares
    where user_id = ${userId} and kind = ${kind} and target_id = ${targetId} and expires_at > now() + interval '1 day'
    order by expires_at desc limit 1`;
  if (existing) return { token: existing.token, expiresAt: existing.expires_at };
  const token = randomBytes(18).toString("base64url");
  const [row] = await db<{ expires_at: Date }[]>`
    insert into preview_shares (token, user_id, project_id, kind, target_id, expires_at)
    values (${token}, ${userId}, ${target.project_id}, ${kind}, ${targetId}, now() + make_interval(days => ${SHARE_DAYS}))
    returning expires_at`;
  return { token, expiresAt: row!.expires_at };
}

/** The share for a token: null if unknown, "expired" if past its date. */
export async function resolveShare(token: string): Promise<Share | "expired" | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await sql()<Share[]>`select token, user_id, kind, target_id, expires_at from preview_shares where token = ${token}`;
  if (!row) return null;
  return new Date(row.expires_at).getTime() < Date.now() ? "expired" : row;
}
