#!/usr/bin/env -S node --import tsx
import { migrate } from "./index";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("[migrate] DATABASE_URL is not set. On Railway: DATABASE_URL=${{Postgres.DATABASE_URL}} (see docs/railway.md).");
  process.exit(1);
}
migrate(url, { log: (m) => console.log(`[migrate] ${m}`) })
  .then((r) => console.log(`[migrate] done (${r.applied.length} applied)`))
  .catch((e) => {
    console.error("[migrate] failed:", e);
    process.exit(1);
  });
