import "server-only";
import { z } from "zod";
import { appOrigin } from "./hosts";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** supabase | password (own email/password + Google) | dev (any email, local only) */
  AUTH_DRIVER: z.enum(["supabase", "password", "dev"]),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** supabase | s3 (Railway bucket, any S3-compatible store) | local */
  STORAGE_DRIVER: z.enum(["supabase", "s3", "local"]),
  LOCAL_STORAGE_DIR: z.string().default("./.storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  /** Public origin of this app, e.g. https://redesign.ai (defaults to Railway's public domain). */
  APP_ORIGIN: z.string(),
  /** Published sites live at <slug>.<SITES_DOMAIN> when set, otherwise at /site/<slug>. */
  SITES_DOMAIN: z.string().default(""),
  /** HMAC secret for session cookies (password and dev drivers). */
  SESSION_SECRET: z.string().default("dev-only-secret-change-me-dev-only-secret"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ALLOW_DEV_AUTH: z.string().optional(),
  VERCEL_API_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  FORMS_FROM_EMAIL: z.string().default("Redesign AI <forms@redesign.ai>"),
  /** Max new billed jobs per user per day (directions, builds). */
  DAILY_JOB_LIMIT: z.coerce.number().int().default(20),
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

/** Raw env with smart defaults (Supabase if configured, else own auth; storage by what is set). */
function withDefaults(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const supabase = !!source["NEXT_PUBLIC_SUPABASE_URL"];
  const s3 = s3Vars(source);
  return {
    ...source,
    ...s3,
    APP_ORIGIN: appOrigin(source),
    AUTH_DRIVER: source["AUTH_DRIVER"] || (supabase ? "supabase" : "password"),
    STORAGE_DRIVER: source["STORAGE_DRIVER"] || (s3["S3_BUCKET"] ? "s3" : supabase ? "supabase" : "local"),
  };
}

/** Configuration problems as variable names (never values), for /api/health and logs. */
export function configProblems(source: Record<string, string | undefined> = process.env): string[] {
  const raw = withDefaults(source);
  const problems: string[] = [];
  if (!raw.DATABASE_URL) problems.push("DATABASE_URL");
  if (raw.AUTH_DRIVER === "supabase") {
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) if (!raw[k]) problems.push(k);
  }
  if (raw.AUTH_DRIVER === "password" || raw.AUTH_DRIVER === "dev") {
    if (source["NODE_ENV"] === "production" && (!raw["SESSION_SECRET"] || raw["SESSION_SECRET"].length < 32)) problems.push("SESSION_SECRET (min 32 tecken)");
  }
  if (raw.AUTH_DRIVER === "dev" && source["NODE_ENV"] === "production" && raw["ALLOW_DEV_AUTH"] !== "1") problems.push("AUTH_DRIVER=dev är inte tillåtet i produktion");
  if (raw.STORAGE_DRIVER === "s3") {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!raw[k]) problems.push(k);
  }
  if (raw.STORAGE_DRIVER === "supabase" && !raw["SUPABASE_SERVICE_ROLE_KEY"]) problems.push("SUPABASE_SERVICE_ROLE_KEY");
  // On Railway web and worker are separate containers: local files would not be shared.
  if (raw.STORAGE_DRIVER === "local" && source["RAILWAY_ENVIRONMENT"]) problems.push("S3_BUCKET (Railway Bucket, se docs/railway.md)");
  return problems;
}

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const problems = configProblems();
  if (problems.length) throw new Error(`Missing or invalid configuration: ${problems.join(", ")}. See /api/health.`);
  cached = schema.parse(withDefaults(process.env));
  return cached;
}
