#!/usr/bin/env -S node --import tsx
import { migrate } from "./index";

/**
 * pnpm db:migrate. With --soft (used when the web app starts) problems are logged but never block the
 * start, so the app can still explain them on /api/health.
 */
const soft = process.argv.includes("--soft");
const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("[migrate] DATABASE_URL is not set. On Railway: DATABASE_URL=${{Postgres.DATABASE_URL}} (see docs/railway.md).");
  process.exit(soft ? 0 : 1);
}
migrate(url, { log: (m) => console.log(`[migrate] ${m}`) })
  .then((r) => console.log(`[migrate] done (${r.applied.length} applied)`))
  .catch((e) => {
    console.error("[migrate] failed:", e);
    process.exit(soft ? 0 : 1);
  });
