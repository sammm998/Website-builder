import { safeFetch, type GuardOptions } from "./ssrf";

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|docx?|xlsx?|pptx?|csv|xml|json|txt|css|js|woff2?|ttf|eot)$/i;
const TRACKING = /^(utm_|fbclid|gclid|mc_|_ga|ref$|ref_)/i;

/** Two hosts belong to the same site if they only differ by a leading "www.". */
export function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return strip(a.hostname) === strip(b.hostname);
}

/**
 * Canonical crawl key: same scheme/host as the start URL, no hash, no tracking params,
 * no trailing slash (except root). Returns null for URLs that are not crawlable pages.
 */
export function normalizePageUrl(raw: string, start: URL): string | null {
  let url: URL;
  try {
    url = new URL(raw, start);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!sameSite(url, start)) return null;
  if (SKIP_EXT.test(url.pathname)) return null;
  if (/\/(wp-admin|wp-login|wp-json|cart|checkout|login|logout|account|feed)(\/|$)/i.test(url.pathname)) return null;
  url.hash = "";
  url.protocol = start.protocol;
  url.host = start.host;
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  // Query-string variants are almost always filters/pagination; keep pages path-based.
  if ([...url.searchParams.keys()].length > 0) return null;
  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/$/, "");
  return `${url.origin}${path}`;
}

export function pathOf(url: string): string {
  const p = new URL(url).pathname;
  return p.length > 1 ? p.replace(/\/$/, "") : "/";
}

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
  raw: string;
}

export function parseRobots(text: string, agent = "redesignai"): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(clean);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!lastWasAgent || !current) groups.push((current = { agents: [], allow: [], disallow: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value) current.disallow.push(value);
    if (key === "allow" && value) current.allow.push(value);
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const group = specific ?? groups.find((g) => g.agents.includes("*"));
  return { disallow: group?.disallow ?? [], allow: group?.allow ?? [], sitemaps, raw: text };
}

function ruleMatches(rule: string, path: string): number {
  const anchored = rule.endsWith("$");
  const pattern = rule
    .replace(/\$$/, "")
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const re = new RegExp(`^${pattern}${anchored ? "$" : ""}`);
  return re.test(path) ? rule.length : -1;
}

/** Longest-match semantics (RFC 9309): allow wins ties. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  const d = Math.max(-1, ...rules.disallow.map((r) => ruleMatches(r, path)));
  const a = Math.max(-1, ...rules.allow.map((r) => ruleMatches(r, path)));
  return d < 0 || a >= d;
}

export async function fetchRobots(origin: string, opts: GuardOptions): Promise<RobotsRules> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { ...opts, maxBytes: 500_000, timeoutMs: 10_000 });
    if (res.status >= 400) return parseRobots("");
    return parseRobots(res.body.toString("utf8"));
  } catch {
    return parseRobots("");
  }
}

/** Reads sitemap(s) recursively (sitemap index support), returns page URLs. */
export async function fetchSitemapUrls(
  candidates: string[],
  start: URL,
  opts: GuardOptions & { limit?: number },
): Promise<string[]> {
  const limit = opts.limit ?? 500;
  const queue = [...new Set(candidates)];
  const seen = new Set<string>();
  const pages: string[] = [];
  while (queue.length && seen.size < 10 && pages.length < limit) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    let xml: string;
    try {
      const target = new URL(next, start);
      if (!sameSite(target, start)) continue;
      const res = await safeFetch(target.href, { ...opts, maxBytes: 10_000_000, timeoutMs: 15_000 });
      if (res.status >= 400) continue;
      xml = res.body.toString("utf8");
    } catch {
      continue;
    }
    const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
      m[1]!.trim().replace(/&amp;/g, "&"),
    );
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else pages.push(...locs);
  }
  return [...new Set(pages)].slice(0, limit);
}
