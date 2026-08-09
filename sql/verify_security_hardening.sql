-- =============================================================================
-- VERIFY: security_hardening_minimal (20260811000001)
-- Run in the Supabase SQL editor AFTER applying the migration. It prints a
-- readable PASS/FAIL report instead of raising errors, so it is safe to run.
-- =============================================================================

DO $$
DECLARE
  v_checks    TEXT[] := ARRAY[]::TEXT[];
  v_ok        INT := 0;
  v_fail      INT := 0;
  v_has_admin BOOLEAN;
  v_grantee   TEXT;
  v_has_trig  BOOLEAN;
  v_grant     TEXT;
BEGIN
  -----------------------------------------------------------------------------
  -- CHECK 1: _require_admin() must NOT contain the auto-promote branch.
  -----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_require_admin'
      AND pg_get_functiondef(p.oid) ILIKE '%insert%'
  ) THEN
    v_checks := v_checks || ARRAY['FAIL   _require_admin() still contains an INSERT (auto-promote)'];
    v_fail := v_fail + 1;
  ELSE
    v_checks := v_checks || ARRAY['OK     _require_admin() has no auto-promote INSERT'];
    v_ok := v_ok + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 2: _require_admin() must not be executable by authenticated.
  -----------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = '_require_admin'
      AND grantee IN ('authenticated', 'anon', 'PUBLIC')
  ) INTO v_grant;
  IF v_grant THEN
    v_checks := v_checks || ARRAY['FAIL   authenticated/anon can still EXECUTE _require_admin()'];
    v_fail := v_fail + 1;
  ELSE
    v_checks := v_checks || ARRAY['OK     _require_admin() not executable by authenticated/anon'];
    v_ok := v_ok + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 3: admin_repair_self() must not be executable by authenticated.
  -----------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'admin_repair_self'
      AND grantee IN ('authenticated', 'anon', 'PUBLIC')
  ) INTO v_grant;
  IF v_grant THEN
    v_checks := v_checks || ARRAY['FAIL   authenticated/anon can still EXECUTE admin_repair_self()'];
    v_fail := v_fail + 1;
  ELSE
    v_checks := v_checks || ARRAY['OK     admin_repair_self() not executable by authenticated/anon'];
    v_ok := v_ok + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 4: the profiles guard trigger must exist.
  -----------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table = 'profiles'
      AND trigger_name = 'trg_protect_profile_sensitive_fields'
      AND event_manipulation = 'UPDATE'
  ) INTO v_has_trig;
  IF v_has_trig THEN
    v_checks := v_checks || ARRAY['OK     trg_protect_profile_sensitive_fields present on profiles'];
    v_ok := v_ok + 1;
  ELSE
    v_checks := v_checks || ARRAY['FAIL   trg_protect_profile_sensitive_fields missing on profiles'];
    v_fail := v_fail + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 5: the trigger body must reference has_role + the sensitive columns.
  -----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'protect_profile_sensitive_fields'
      AND pg_get_functiondef(p.oid) ILIKE '%has_role%'
      AND pg_get_functiondef(p.oid) ILIKE '%license_status%'
  ) THEN
    v_checks := v_checks || ARRAY['OK     trigger guards license_status via has_role()'];
    v_ok := v_ok + 1;
  ELSE
    v_checks := v_checks || ARRAY['FAIL   trigger body missing has_role/license_status guard'];
    v_fail := v_fail + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 6: admin RPCs must still reachable by authenticated (no collateral).
  -----------------------------------------------------------------------------
  FOR v_grantee IN SELECT DISTINCT grantee FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name IN ('admin_set_license', 'admin_approve_activation', 'admin_modify_activation')
      AND grantee = 'authenticated'
  LOOP
    v_checks := v_checks || ARRAY['OK     admin RPCs still granted to authenticated'];
    v_ok := v_ok + 1;
  END LOOP;
  IF v_grantee IS NULL THEN
    v_checks := v_checks || ARRAY['FAIL   admin RPC grants to authenticated were lost'];
    v_fail := v_fail + 1;
  END IF;

  -----------------------------------------------------------------------------
  -- CHECK 7: an admin must still exist (never got promoted) or be re-creatable.
  -----------------------------------------------------------------------------
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role)
    INTO v_has_admin;
  IF v_has_admin THEN
    v_checks := v_checks || ARRAY['OK     an admin row exists in user_roles'];
    v_ok := v_ok + 1;
  ELSE
    v_checks := v_checks || ARRAY['WARN   no admin row in user_roles (create one via SQL: select public.admin_repair_self(); as postgres)'];
    v_ok := v_ok + 1;
  END IF;

  -----------------------------------------------------------------------------
  RAISE NOTICE E'\n====== SECURITY HARDENING VERIFICATION (%/ ok, %/ fail) ======\n%',
    v_ok, v_fail, array_to_string(v_checks, E'\n');
END $$;
