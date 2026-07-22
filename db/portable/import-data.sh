#!/usr/bin/env bash
# ============================================================================
# import-data.sh — Load CSV export into the DESTINATION project.
# Runs inside one transaction per table so partial failures roll back cleanly.
# Assumes schema/00, 01, 02 have already been applied to the destination.
# ============================================================================
set -euo pipefail
: "${SUPABASE_DB_URL_DIRECT:?set SUPABASE_DB_URL_DIRECT}"

IN="${IN_DIR:-./_export}"
[ -d "$IN" ] || { echo "Missing ${IN}"; exit 1; }

# Same order as export-data.sh
TABLES=(
  subscription_plans system_config app_settings ussd_codes amount_presets
  profiles user_roles user_settings
  devices trials licenses device_bans activations
  sim_assignments
  distributors distributor_transactions payments
  contacts transfers daily_summaries
  sessions app_events audit_logs admin_actions notifications
  sync_logs sync_metrics sync_conflicts
  account_lockouts failed_logins
)

PSQL=(psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -q)

echo "[pre] disabling user triggers on destination public tables"
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t); END LOOP;
END$$;
SQL

for t in "${TABLES[@]}"; do
  f="${IN}/${t}.csv"
  [ -f "$f" ] || { echo "  · skip ${t} (no CSV)"; continue; }
  echo "  ← ${t}"
  "${PSQL[@]}" -c "BEGIN; TRUNCATE public.${t} RESTART IDENTITY CASCADE; \
    \\COPY public.${t} FROM '${f}' WITH (FORMAT csv, HEADER true); COMMIT;"
done

echo "[post] re-enabling triggers + resyncing sequences"
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t); END LOOP;
END$$;

-- Resync every sequence owned by a public column to MAX(col)+1
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.relname AS seq, n.nspname AS tsch, t.relname AS tbl, a.attname AS col
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE s.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1))',
                   r.seq, r.col, r.tsch, r.tbl);
  END LOOP;
END$$;
SQL

echo "[verify] destination row counts:"
"${PSQL[@]}" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables
                 WHERE schemaname='public' ORDER BY relname;"

echo "Import complete."
