#!/usr/bin/env bash
# ============================================================================
# export-data.sh — READ-ONLY export of all public tables from the SOURCE project
#
# Auth-related data (auth.users, auth.identities, auth.sessions) is NOT
# exported here. Supabase does not permit direct writes to the auth schema
# on managed projects. Recreate users on the destination by one of:
#   • Users sign in again on the new project (recommended for OAuth).
#   • Use `supabase auth import` (Supabase CLI ≥ 1.180) with a JSON export
#     that Supabase support can generate for you.
# public.profiles / public.user_roles ARE exported here and can be re-linked
# once destination auth.users rows exist with matching UUIDs.
# ============================================================================
set -euo pipefail
: "${SOURCE_DB_URL_DIRECT:?set SOURCE_DB_URL_DIRECT}"

OUT="${OUT_DIR:-./_export}"
mkdir -p "$OUT"
echo "Exporting to ${OUT}/  (source: ***redacted***)"

# Foreign-key dependency order (parents before children).
TABLES=(
  # Reference / independent
  subscription_plans system_config app_settings ussd_codes amount_presets
  # Identity-linked
  profiles user_roles user_settings
  # Devices & licensing
  devices trials licenses device_bans activations
  sim_assignments
  # Financial
  distributors distributor_transactions payments
  # Contacts & transfers
  contacts transfers daily_summaries
  # Ops / audit / sync
  sessions app_events audit_logs admin_actions notifications
  sync_logs sync_metrics sync_conflicts
  account_lockouts failed_logins
)

for t in "${TABLES[@]}"; do
  echo "  → ${t}"
  psql "$SOURCE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -qAtc \
    "\\COPY (SELECT * FROM public.${t} ORDER BY 1) TO '${OUT}/${t}.csv' WITH (FORMAT csv, HEADER true, FORCE_QUOTE *)"
done

# Record row counts for later verification
psql "$SOURCE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -qAtc \
  "SELECT relname||','||n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname" \
  > "${OUT}/_rowcounts.csv"

echo "Export complete. ${OUT}/_rowcounts.csv contains source row counts."
