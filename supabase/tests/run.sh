#!/usr/bin/env bash
# Applies all migrations to a throwaway Postgres cluster and runs RLS tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
RUN=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP"; RUN="runuser -u postgres --"; fi
$RUN "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
set +e
OUT="$("${PSQL[@]}" -f "$ROOT/supabase/tests/rls.sql" 2>&1)"; CODE=$?
set -e
echo "$OUT" | grep -E "ok:|FAILED|PASSED|ERROR" || echo "$OUT"
exit $CODE
