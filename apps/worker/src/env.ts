import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** db (Postgres table, default on Railway) | s3 (Railway bucket or any S3-compatible store) | supabase | local */
  STORAGE_DRIVER: z.enum(["db", "supabase", "s3", "local"]),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  /** Local storage: directory on disk and the public URL prefix the web app serves it under. */
  LOCAL_STORAGE_DIR: z.string().default("./.storage"),
  LOCAL_STORAGE_PUBLIC_URL: z.string(),
  /** Public origin of the web app (runtime, fonts and stored media are served from here). */
  APP_ORIGIN: z.string(),
  /** Base domain for published sites: <slug>.<SITES_DOMAIN>; empty = /site/<slug> on the app origin. */
  SITES_DOMAIN: z.string().default(""),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Health endpoint port (Railway injects PORT). */
  WORKER_PORT: z.coerce.number().int(),
  CHROMIUM_PATH: z.string().optional(),
  /** Dev/test only: allow crawling private network hosts (fixture servers). Never enable in production. */
  CRAWLER_ALLOW_PRIVATE: z.enum(["0", "1"]).default("0"),
  AI_PROVIDER: z.enum(["anthropic", "fake"]).default("anthropic"),
});

export type Env = z.infer<typeof schema>;

/** S3 settings: our names first, then the AWS-SDK names and the plain names a Railway bucket exposes. */
const S3_ALIASES: Record<string, string[]> = {
  S3_ENDPOINT: ["AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL", "ENDPOINT"],
  S3_BUCKET: ["AWS_S3_BUCKET_NAME", "BUCKET"],
  S3_ACCESS_KEY_ID: ["AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID"],
  S3_SECRET_ACCESS_KEY: ["AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY"],
  S3_REGION: ["AWS_DEFAULT_REGION", "AWS_REGION", "REGION"],
};
function s3Vars(source: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(S3_ALIASES).map(([k, alts]) => [k, [k, ...alts].map((a) => source[a]?.trim()).find(Boolean)]));
}

function withDefaults(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const appOrigin = (source["APP_ORIGIN"]?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  const s3 = s3Vars(source);
  return {
    ...source,
    ...s3,
    APP_ORIGIN: appOrigin,
    STORAGE_DRIVER: source["STORAGE_DRIVER"] || (s3["S3_BUCKET"] ? "s3" : source["SUPABASE_URL"] ? "supabase" : source["RAILWAY_ENVIRONMENT"] ? "db" : "local"),
    LOCAL_STORAGE_PUBLIC_URL: source["LOCAL_STORAGE_PUBLIC_URL"] || `${appOrigin}/storage`,
    WORKER_PORT: source["WORKER_PORT"] || source["PORT"] || "8080",
  };
}

/** Missing or invalid variables by name (never values). */
export function configProblems(source: Record<string, string | undefined> = process.env): string[] {
  const raw = withDefaults(source);
  const problems: string[] = [];
  if (!raw["DATABASE_URL"]) problems.push("DATABASE_URL");
  const production = source["NODE_ENV"] === "production" || !!source["RAILWAY_ENVIRONMENT"];
  if (production && !source["APP_ORIGIN"]) problems.push("APP_ORIGIN (webbappens publika adress, t.ex. https://redesignweb-production.up.railway.app)");
  if (raw["STORAGE_DRIVER"] === "s3") {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!raw[k]) problems.push(k);
  }
  if (raw["STORAGE_DRIVER"] === "supabase") {
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!raw[k]) problems.push(k);
  }
  if (source["RAILWAY_ENVIRONMENT"] && raw["STORAGE_DRIVER"] === "local") problems.push("STORAGE_DRIVER (local fungerar inte med separata tjänster, ta bort variabeln eller använd db/s3)");
  // ANTHROPIC_API_KEY is optional here: the owner can enter the key in the app (setup page) instead.
  return problems;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const problems = configProblems(source);
  if (problems.length) throw new ConfigError(problems);
  return schema.parse(withDefaults(source));
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Missing or invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}
