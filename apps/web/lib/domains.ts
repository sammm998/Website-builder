import "server-only";
import { resolveCname, resolve4 } from "node:dns/promises";
import { z } from "zod";
import { sql } from "./db";
import { env } from "./env";
import { UserError, enqueue } from "./repo";

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .pipe(z.string().regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like www.example.com"));

export interface DnsRecord {
  type: "CNAME" | "A" | "TXT";
  name: string;
  value: string;
}

/** Target the customer points DNS at. */
function dnsTarget(): DnsRecord[] {
  const e = env();
  if (e.VERCEL_API_TOKEN) return [{ type: "CNAME", name: "www", value: "cname.vercel-dns.com" }, { type: "A", name: "@", value: "76.76.21.21" }];
  const host = e.SITES_DOMAIN || new URL(e.APP_ORIGIN).hostname;
  return [{ type: "CNAME", name: "www", value: host }];
}

async function vercel(path: string, init: RequestInit = {}) {
  const e = env();
  const team = e.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(e.VERCEL_TEAM_ID)}` : "";
  const res = await fetch(`https://api.vercel.com${path}${team}`, {
    ...init,
    headers: { authorization: `Bearer ${e.VERCEL_API_TOKEN}`, "content-type": "application/json", ...init.headers },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

export async function addDomain(userId: string, projectId: string, raw: string) {
  const hostname = hostnameSchema.parse(raw);
  const db = sql();
  const [site] = await db<{ id: string }[]>`select id from published_sites where project_id = ${projectId} and user_id = ${userId}`;
  if (!site) throw new UserError("Publish the website first.");
  const [taken] = await db<{ id: string }[]>`select id from domains where hostname = ${hostname}`;
  if (taken) throw new UserError("That domain is already connected.");
  let verification: unknown = dnsTarget();
  const e = env();
  if (e.VERCEL_API_TOKEN && e.VERCEL_PROJECT_ID) {
    const r = await vercel(`/v10/projects/${e.VERCEL_PROJECT_ID}/domains`, { method: "POST", body: JSON.stringify({ name: hostname }) });
    if (!r.ok && r.status !== 409) throw new UserError(`Could not add the domain (${String((r.body["error"] as { message?: string })?.message ?? r.status)}).`);
    const extra = (r.body["verification"] as { type: string; domain: string; value: string }[] | undefined) ?? [];
    verification = [...dnsTarget(), ...extra.map((v) => ({ type: v.type as DnsRecord["type"], name: v.domain, value: v.value }))];
  }
  await db`insert into domains (site_id, user_id, hostname, verification) values (${site.id}, ${userId}, ${hostname}, ${db.json(verification as never)})`;
}

/** Checks DNS (or Vercel's verification) and republishes with the domain as canonical origin. */
export async function verifyDomain(userId: string, domainId: string) {
  const db = sql();
  const [d] = await db<{ id: string; hostname: string; site_id: string; project_id: string; slug: string }[]>`
    select d.id, d.hostname, d.site_id, s.project_id, s.slug from domains d join published_sites s on s.id = d.site_id
    where d.id = ${domainId} and d.user_id = ${userId}`;
  if (!d) throw new UserError("Domain not found.");
  const e = env();
  let verified = false;
  if (e.VERCEL_API_TOKEN && e.VERCEL_PROJECT_ID) {
    await vercel(`/v10/projects/${e.VERCEL_PROJECT_ID}/domains/${d.hostname}/verify`, { method: "POST" });
    const r = await vercel(`/v9/projects/${e.VERCEL_PROJECT_ID}/domains/${d.hostname}`);
    verified = r.ok && r.body["verified"] === true;
  } else {
    const target = dnsTarget()[0]!.value;
    const cnames = await resolveCname(d.hostname).catch(() => [] as string[]);
    const targetIps = await resolve4(target).catch(() => [] as string[]);
    const ips = await resolve4(d.hostname).catch(() => [] as string[]);
    verified = cnames.some((c) => c.replace(/\.$/, "") === target) || (ips.length > 0 && ips.every((ip) => targetIps.includes(ip)));
  }
  await db`update domains set status = ${verified ? "verified" : "pending"}, last_checked_at = now() where id = ${d.id}`;
  if (verified) await enqueue(userId, d.project_id, "publish", { slug: d.slug }).catch(() => {});
  return verified;
}

export async function removeDomain(userId: string, domainId: string) {
  const db = sql();
  const [d] = await db<{ hostname: string }[]>`delete from domains where id = ${domainId} and user_id = ${userId} returning hostname`;
  const e = env();
  if (d && e.VERCEL_API_TOKEN && e.VERCEL_PROJECT_ID) await vercel(`/v9/projects/${e.VERCEL_PROJECT_ID}/domains/${d.hostname}`, { method: "DELETE" });
}
