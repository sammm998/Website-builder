import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type postgres from "postgres";
import { sql } from "./db";
import { env } from "./env";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { UserError } from "./repo";

/** Own email/password accounts (AUTH_DRIVER=password). Users live in auth.users like on Supabase. */

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 10;
const MAX_SIGNUPS_PER_IP_HOUR = 5;
/** Compared against when the account does not exist, so response time does not reveal it. */
let dummyHash: Promise<string> | null = null;

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `ip:${createHash("sha256").update(`${env().SESSION_SECRET}:${ip}`).digest("hex").slice(0, 32)}`;
}

async function recentFailures(keys: string[]): Promise<number> {
  const [row] = await sql()<{ n: number }[]>`
    select count(*)::int as n from login_attempts
    where key in ${sql()(keys)} and created_at > now() - make_interval(mins => ${WINDOW_MINUTES})`;
  return row?.n ?? 0;
}

async function recordFailure(keys: string[]) {
  const db = sql();
  await db`insert into login_attempts ${db(keys.map((key) => ({ key })))}`;
  // Housekeeping: keep the table small.
  await db`delete from login_attempts where created_at < now() - interval '1 day'`;
}

export async function signIn(emailInput: string, password: string): Promise<{ id: string; email: string }> {
  const email = emailInput.trim().toLowerCase();
  const keys = [`email:${email}`, await clientKey()];
  if ((await recentFailures(keys)) >= MAX_FAILURES) throw new UserError("Too many attempts. Wait 15 minutes and try again.");
  const [row] = await sql()<{ id: string; email: string; password_hash: string | null }[]>`
    select u.id, u.email, c.password_hash from auth.users u left join user_credentials c on c.user_id = u.id
    where lower(u.email) = ${email}`;
  dummyHash ??= hashPassword("not-a-real-password");
  const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
  if (!row || !row.password_hash || !ok) {
    await recordFailure(keys);
    if (row && !row.password_hash) throw new UserError("This account uses Google. Continue with Google instead.");
    throw new UserError("Wrong email or password.");
  }
  await sql()`delete from login_attempts where key = ${keys[0]!}`;
  return { id: row.id, email: row.email };
}

export async function signUp(emailInput: string, password: string): Promise<{ id: string; email: string }> {
  const email = emailInput.trim().toLowerCase();
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem);
  const ipKey = `signup:${await clientKey()}`;
  const db = sql();
  const [recent] = await db<{ n: number }[]>`select count(*)::int as n from login_attempts where key = ${ipKey} and created_at > now() - interval '1 hour'`;
  if ((recent?.n ?? 0) >= MAX_SIGNUPS_PER_IP_HOUR) throw new UserError("Too many new accounts from this network. Try again later.");
  const hash = await hashPassword(password);
  return db.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
    if (existing) throw new UserError("An account with this email already exists. Log in instead.");
    const [user] = await tx<{ id: string }[]>`insert into auth.users (email) values (${email}) returning id`;
    await tx`insert into user_credentials (user_id, password_hash) values (${user!.id}, ${hash})`;
    await claimAdminIfNone(tx, user!.id);
    await tx`insert into login_attempts (key) values (${ipKey})`;
    return { id: user!.id, email };
  });
}

/**
 * Finds or creates the user for a verified Google identity. Linking by email is safe because Google
 * verified it; a password set on that email by someone else (no email verification for password
 * sign-ups) is removed so a pre-registered account cannot be used to take over the Google user.
 */
export async function upsertGoogleUser(identity: { subject: string; email: string; name?: string }): Promise<{ id: string; email: string }> {
  const email = identity.email.trim().toLowerCase();
  return sql().begin(async (tx) => {
    const [linked] = await tx<{ id: string; email: string }[]>`
      select u.id, u.email from oauth_identities o join auth.users u on u.id = o.user_id where o.provider = 'google' and o.subject = ${identity.subject}`;
    if (linked) return linked;
    let [user] = await tx<{ id: string; email: string }[]>`select id, email from auth.users where lower(email) = ${email}`;
    if (user) {
      await tx`delete from user_credentials where user_id = ${user.id}`;
    } else {
      [user] = await tx<{ id: string; email: string }[]>`
        insert into auth.users (email, raw_user_meta_data) values (${email}, ${tx.json({ full_name: identity.name ?? "" })}) returning id, email`;
    }
    await tx`insert into oauth_identities (provider, subject, user_id, email) values ('google', ${identity.subject}, ${user!.id}, ${email})`;
    await claimAdminIfNone(tx, user!.id);
    return user!;
  });
}

/**
 * The first account of an installation becomes its administrator (manages installation settings such as
 * the Claude key on the setup page). Serialised so two simultaneous sign-ups cannot both claim it.
 */
async function claimAdminIfNone(tx: postgres.TransactionSql, userId: string) {
  await tx`select pg_advisory_xact_lock(72610111)`;
  await tx`
    insert into user_roles (user_id, role)
    select ${userId}, 'admin' where not exists (select 1 from user_roles where role = 'admin')
    on conflict do nothing`;
}
