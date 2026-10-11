import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";

/**
 * SSRF protection for every outbound request made on behalf of a user (crawl, sitemap, media).
 *
 * - Only http(s) on default ports, no credentials in the URL.
 * - Hostnames are resolved and *every* address must be public unicast.
 * - The check runs again inside the socket `lookup` hook, so DNS rebinding between validation and
 *   connect cannot reach internal addresses.
 * - Redirects are followed manually and each hop is re-validated.
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export interface GuardOptions {
  /** Test/dev escape hatch for fixture servers on localhost. Never enable in production. */
  allowPrivate?: boolean;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  const range = parsed.range();
  if (range !== "unicast") return false;
  if (parsed.kind() === "ipv4") {
    const [a = 0, b = 0] = (parsed as ipaddr.IPv4).octets;
    // Extra reserved blocks not covered by ipaddr ranges.
    if (a === 0 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a === 192 && b === 0) return false;
  } else {
    const first = (parsed as ipaddr.IPv6).parts[0]!;
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return false;
    if (first === 0x2001 && (parsed as ipaddr.IPv6).parts[1] === 0x0db8) return false; // documentation
  }
  return true;
}

/** Synchronous URL shape checks (no DNS). Returns the parsed URL. */
export function assertUrlShape(raw: string, opts: GuardOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Invalid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BlockedUrlError("Only http(s) URLs are allowed.");
  if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not allowed.");
  if (opts.allowPrivate) return url;
  if (url.port && url.port !== "80" && url.port !== "443") throw new BlockedUrlError("Only default ports are allowed.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") && !ipaddr.isValid(host.replace(/^\[|\]$/g, ""))) throw new BlockedUrlError("Hostname is not public.");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new BlockedUrlError("Hostname is not public.");
  }
  const literal = host.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(literal) && !isPublicAddress(literal)) throw new BlockedUrlError("Address is not public.");
  return url;
}

type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = (host) =>
  new Promise((resolve, reject) =>
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses) =>
      err ? reject(err) : resolve((addresses as LookupAddress[]).map((a) => a.address)),
    ),
  );

/** Full check including DNS: every resolved address must be public. */
export async function assertPublicUrl(raw: string, opts: GuardOptions & { resolver?: Resolver } = {}): Promise<URL> {
  const url = assertUrlShape(raw, opts);
  if (opts.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) return url;
  let addresses: string[];
  try {
    addresses = await (opts.resolver ?? defaultResolver)(host);
  } catch {
    throw new BlockedUrlError(`Could not resolve ${host}.`);
  }
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new BlockedUrlError(`${host} resolves to a non-public address.`);
  }
  return url;
}

/** undici dispatcher that re-validates resolved addresses at connect time (anti DNS-rebinding). */
export function guardedAgent(opts: GuardOptions = {}): Agent {
  return new Agent({
    connect: {
      timeout: 10_000,
      lookup: (hostname, options, callback) => {
        dnsLookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
          if (err) return callback(err, [] as unknown as string, 0);
          const list = addresses as unknown as LookupAddress[];
          const safe = opts.allowPrivate ? list : list.filter((a) => isPublicAddress(a.address));
          if (safe.length === 0 || (!opts.allowPrivate && safe.length !== list.length)) {
            return callback(new BlockedUrlError(`${hostname} resolves to a non-public address.`), [] as unknown as string, 0);
          }
          if ((options as { all?: boolean }).all) return callback(null, safe as unknown as string, 0);
          return callback(null, safe[0]!.address, safe[0]!.family);
        });
      },
    },
    headersTimeout: 20_000,
    bodyTimeout: 30_000,
  });
}

const agents = new Map<boolean, Agent>();
function agentFor(opts: GuardOptions) {
  const key = !!opts.allowPrivate;
  let agent = agents.get(key);
  if (!agent) agents.set(key, (agent = guardedAgent(opts)));
  return agent;
}

export interface SafeFetchOptions extends GuardOptions {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
  /** Restrict accepted content types (prefix match), e.g. ["text/html"]. */
  accept?: string[];
}

export interface SafeFetchResult {
  url: string;
  status: number;
  headers: Headers;
  body: Buffer;
  contentType: string;
}

export const USER_AGENT = "RedesignAI-Crawler/1.0 (+https://redesign.ai/bot)";

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const url = await assertPublicUrl(current, opts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...opts.headers },
        // @ts-expect-error undici-specific option on Node's fetch
        dispatcher: agentFor(opts),
      });
    } catch (error) {
      clearTimeout(timer);
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof BlockedUrlError) throw cause;
      throw new Error(`Request to ${url.host} failed: ${(error as Error).message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => {});
      current = new URL(res.headers.get("location")!, url).href;
      continue;
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (opts.accept && res.ok && !opts.accept.some((a) => contentType.startsWith(a))) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => {});
      throw new Error(`Unexpected content type ${contentType || "unknown"} for ${url.href}`);
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      clearTimeout(timer);
      await res.body?.cancel().catch(() => {});
      throw new Error(`Response too large (${declared} bytes).`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      if (res.body && opts.method !== "HEAD") {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Response exceeded ${maxBytes} bytes.`);
          }
          chunks.push(value);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return { url: url.href, status: res.status, headers: res.headers, body: Buffer.concat(chunks), contentType };
  }
  throw new Error("Too many redirects.");
}
