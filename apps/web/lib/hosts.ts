/**
 * Which host names belong to the app itself (as opposed to published customer sites on custom
 * domains). Safe for proxy.ts (no server-only imports).
 */

const PLATFORM_SUFFIXES = [".up.railway.app", ".railway.app", ".vercel.app"];

/** Public origin of the app. Falls back to Railway's injected public domain, then localhost. */
export function appOrigin(env: Record<string, string | undefined> = process.env): string {
  const explicit = env["APP_ORIGIN"]?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const railway = env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
  if (railway) return `https://${railway}`;
  return "http://localhost:3000";
}

export function isAppHost(host: string, env: Record<string, string | undefined> = process.env): boolean {
  if (host.startsWith("[")) return true; // IPv6 literal: never a customer domain
  const h = host.toLowerCase().split(":")[0]!.replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return true;
  const known = [appOrigin(env), env["RAILWAY_PUBLIC_DOMAIN"] ? `https://${env["RAILWAY_PUBLIC_DOMAIN"]}` : ""]
    .filter(Boolean)
    .map((o) => {
      try {
        return new URL(o).hostname.toLowerCase();
      } catch {
        return "";
      }
    });
  if (known.includes(h)) return true;
  // Platform default domains are never customer domains.
  return PLATFORM_SUFFIXES.some((s) => h.endsWith(s));
}

/** Slug when the host is <slug>.<SITES_DOMAIN>, otherwise null. */
export function sitesSubdomainSlug(host: string, env: Record<string, string | undefined> = process.env): string | null {
  const domain = (env["SITES_DOMAIN"] ?? "").toLowerCase().trim();
  const h = host.toLowerCase().split(":")[0]!;
  if (!domain || !h.endsWith(`.${domain}`)) return null;
  const slug = h.slice(0, -(domain.length + 1));
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}
