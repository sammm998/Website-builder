#!/usr/bin/env bash
# Starts (or reuses) a local Postgres for development at $PGDATA_DIR (default .localdb) on port 54322,
# with all migrations applied on first start (the platform migration provides roles and the auth schema).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${PGDATA_DIR:-$ROOT/.localdb}"
PORT="${PGPORT_DEV:-54322}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
RUN=""
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; fi
if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR"; [ -n "$RUN" ] && chown -R postgres "$DIR"
  $RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
  FRESH=1
fi
if ! $RUN "$PGBIN/pg_ctl" -D "$DIR/data" status >/dev/null 2>&1; then
  $RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" start >/dev/null
fi
if [ "${FRESH:-0}" = "1" ]; then
  PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
  for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
fi
echo "postgres://postgres@127.0.0.1:$PORT/postgres"
