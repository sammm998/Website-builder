import "server-only";
import postgres from "postgres";
import { env } from "./env";

declare global {
  var __redesignSql: postgres.Sql | undefined;
}

/**
 * Server-side service connection. RLS is bypassed, so every query in lib/repo.ts scopes by the
 * authenticated user explicitly (RLS stays enabled as defence in depth for any client access).
 */
export function sql(): postgres.Sql {
  globalThis.__redesignSql ??= postgres(env().DATABASE_URL, { max: 8, idle_timeout: 20, prepare: false, transform: { undefined: null } });
  return globalThis.__redesignSql;
}
