import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  STORAGE_DRIVER: z.enum(["supabase", "local"]).default("supabase"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Local storage: directory on disk and the public URL prefix the web app serves it under. */
  LOCAL_STORAGE_DIR: z.string().default("./.storage"),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default("http://localhost:3000/storage"),
  /** Public origin of the web app (runtime + fonts are served from here). */
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  /** Base domain for published sites: <slug>.<SITES_DOMAIN>; empty = /site/<slug> on the app origin. */
  SITES_DOMAIN: z.string().default(""),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  WORKER_PORT: z.coerce.number().int().default(8080),
  CHROMIUM_PATH: z.string().optional(),
  /** Dev/test only: allow crawling private network hosts (fixture servers). Never enable in production. */
  CRAWLER_ALLOW_PRIVATE: z.enum(["0", "1"]).default("0"),
  AI_PROVIDER: z.enum(["anthropic", "fake"]).default("anthropic"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = schema.parse(source);
  if (env.STORAGE_DRIVER === "supabase" && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase");
  }
  return env;
}
