import postgres from "postgres";

export type Sql = postgres.Sql;

/** Service connection (table owner): bypasses RLS, so every query must scope by project/user itself. */
export function connect(url: string): Sql {
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    transform: { undefined: null },
    types: { bigint: postgres.BigInt },
  });
}

export const json = (sql: Sql, value: unknown) => sql.json(value as postgres.JSONValue);
