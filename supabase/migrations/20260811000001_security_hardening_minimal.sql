-- =============================================================================
-- Minimal security hardening (attack paths found in the 2026-08-09 audit)
--
-- Fixes three escalation paths without touching the auth system, login flows,
-- or any application code:
--
--   1. _require_admin()  → remove the "auto-promote first user" branch.
--      Any authenticated user can currently call it and, if no admin row
--      exists in user_roles, become admin on the spot.
--   2. admin_repair_self() → revoke EXECUTE from authenticated. It lets any
--      authenticated caller grant themselves admin when no admin exists.
--      (Kept callable only by service_role / the SQL editor, where it serves
--      as the documented first-admin bootstrap.)
--   3. profiles self-edit → add a BEFORE UPDATE trigger so a non-admin user
--      can never set their own license_status / license_type / expiry_date /
--      account_status / current_device / trial_start / trial_end directly
--      (the current "Users update own profile" UPDATE policy is unrestricted).
--      Admin RPCs (SECURITY DEFINER, guarded by _require_admin) and the
--      service role (edge functions) bypass this check.
--
-- Idempotent: safe to re-run on any environment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kill the _require_admin auto-promote backdoor.
--    Last definition (20260801000002) auto-promoted the first registered user
--    to admin. Any authenticated user could trigger that via the admin RPCs
--    while user_roles had no admin row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- No client or edge function calls _require_admin() directly (verified). It is
-- only an internal guard for SECURITY DEFINER RPCs, so revoke direct access.
REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC, ANON, AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public._require_admin() TO SERVICE_ROLE;

-- -----------------------------------------------------------------------------
-- 2. Lock down admin_repair_self().
--    Body is unchanged (requires "no admin exists" + SECURITY DEFINER), but it
--    must not be reachable by authenticated users. The operator keeps access
--    via service_role / the Supabase SQL editor for the one-time bootstrap.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_repair_self() FROM PUBLIC, ANON, AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.admin_repair_self() TO SERVICE_ROLE;

-- -----------------------------------------------------------------------------
-- 3. Block non-admin users from changing their own license/account fields.
--    The "Users update own profile" UPDATE policy on public.profiles is
--    unrestricted; app code only ever writes display_name / phone / language /
--    shop_name via updateProfile, but a crafted PATCH could also flip
--    license_status → 'permanent' or wipe expiry_date. This trigger closes
--    that gap for any row update where the caller is not an admin.
--
--    Bypass rules (safe):
--      - Admin flows: admin_* RPCs run SECURITY DEFINER and already called
--        _require_admin(); auth.uid() is the admin → has_role() → allowed.
--      - Service role (edge functions, e.g. device binding / admin reset):
--        auth.uid() is NULL → check skipped.
--      - SQL editor / operator: runs as postgres, auth.uid() is NULL → allowed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL
     AND NOT public.has_role(v_uid, 'admin'::public.app_role)
     AND (
       NEW.license_status IS DISTINCT FROM OLD.license_status
       OR NEW.license_type   IS DISTINCT FROM OLD.license_type
       OR NEW.expiry_date    IS DISTINCT FROM OLD.expiry_date
       OR NEW.account_status IS DISTINCT FROM OLD.account_status
       OR NEW.current_device IS DISTINCT FROM OLD.current_device
       OR NEW.trial_start    IS DISTINCT FROM OLD.trial_start
       OR NEW.trial_end      IS DISTINCT FROM OLD.trial_end
     ) THEN
    RAISE EXCEPTION 'not_allowed_to_change_sensitive_profile_fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_fields();
