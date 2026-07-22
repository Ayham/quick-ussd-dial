#!/usr/bin/env bash
# ============================================================================
# verify-migration.sh — non-destructive checks against the DESTINATION project.
# ============================================================================
set -euo pipefail
: "${SUPABASE_DB_URL_DIRECT:?set SUPABASE_DB_URL_DIRECT}"

PSQL=(psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -qAt)

check() { printf "\n== %s ==\n" "$1"; "${PSQL[@]}" -c "$2"; }

check "Expected 30 public tables (should print 30)" \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';"

check "RLS enabled on every public table (should be empty)" \
  "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;"

check "Tables without any RLS policy (should be empty)" \
  "SELECT t.tablename FROM pg_tables t
   LEFT JOIN pg_policies p ON p.schemaname=t.schemaname AND p.tablename=t.tablename
   WHERE t.schemaname='public' GROUP BY t.tablename HAVING count(p.policyname)=0;"

check "SECURITY DEFINER functions still executable by authenticated (should be empty)" \
  "SELECT p.proname FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.proname NOT IN ('has_role','device_heartbeat','validate_license','activate_license','update_updated_at_column');"

check "GRANTs on user-facing tables (each should list authenticated)" \
  "SELECT table_name, string_agg(privilege_type||':'||grantee, ',' ORDER BY grantee)
   FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name IN ('profiles','contacts','transfers','licenses','devices')
     AND grantee IN ('authenticated','anon','service_role')
   GROUP BY table_name;"

check "Required triggers on devices" \
  "SELECT tgname FROM pg_trigger WHERE tgrelid='public.devices'::regclass AND NOT tgisinternal;"

check "Row counts per table" \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;"

check "Foreign-key integrity — orphaned profiles.user_id (should be empty)" \
  "SELECT p.user_id FROM public.profiles p
   LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL LIMIT 20;"

check "Foreign-key integrity — orphaned user_roles.user_id (should be empty)" \
  "SELECT r.user_id FROM public.user_roles r
   LEFT JOIN auth.users u ON u.id=r.user_id WHERE u.id IS NULL LIMIT 20;"

check "No references to old project ref in code (should be empty)" \
  "SELECT 1 WHERE false;"  # placeholder — real check is repo-wide grep below

echo
echo "Now run this from the repo root:"
echo "  grep -rn --exclude-dir=node_modules --exclude-dir=.git jwfsiqkvzmttkuxldkrq . || echo 'clean'"
