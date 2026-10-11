import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_DRIVER: z.enum(["supabase", "dev"]).default("supabase"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["supabase", "local"]).default("supabase"),
  LOCAL_STORAGE_DIR: z.string().default("./.storage"),
  /** Public origin of this app, e.g. https://redesign.ai */
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  /** Published sites live at <slug>.<SITES_DOMAIN> when set, otherwise at /site/<slug>. */
  SITES_DOMAIN: z.string().default(""),
  /** Dev auth driver only: HMAC secret for the session cookie. */
  SESSION_SECRET: z.string().default("dev-only-secret-change-me-dev-only-secret"),
  VERCEL_API_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  FORMS_FROM_EMAIL: z.string().default("Redesign AI <forms@redesign.ai>"),
  /** Max new billed jobs per user per day (directions, builds). */
  DAILY_JOB_LIMIT: z.coerce.number().int().default(20),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
