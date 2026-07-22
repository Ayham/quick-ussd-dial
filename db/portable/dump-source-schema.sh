#!/usr/bin/env bash
# Produce a byte-exact schema snapshot of the SOURCE (old) project.
# Read-only against the source. Run from your workstation, not from CI.
#
#   export SOURCE_DB_URL_DIRECT=postgresql://postgres:...@db.<old-ref>.supabase.co:5432/postgres
#   ./db/portable/dump-source-schema.sh
set -euo pipefail
: "${SOURCE_DB_URL_DIRECT:?set SOURCE_DB_URL_DIRECT in your environment}"

OUT="$(dirname "$0")/schema/99_authoritative_dump.sql"
echo "Dumping schema from source project into ${OUT}"
pg_dump \
  --schema-only \
  --no-owner --no-privileges \
  --schema=public \
  --exclude-schema='auth|storage|realtime|supabase_functions|vault|extensions|pgbouncer|graphql*|net' \
  "$SOURCE_DB_URL_DIRECT" > "$OUT"
echo "Wrote $(wc -l < "$OUT") lines."
