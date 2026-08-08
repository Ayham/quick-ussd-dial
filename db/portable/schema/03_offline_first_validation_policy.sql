-- =============================================================================
-- 03_offline_first_validation_policy.sql
-- Server-controlled offline validation policy.
--
-- Apply order: 00 → 01 → 02 → 03.
--
-- The SERVER decides how often the client must validate, how long an offline
-- grace period is allowed, when validation is force-required, and whether a
-- license is revoked/expiring. The client NEVER hardcodes any of these values.
--
-- Contents:
--   1. Reconcile license/profile columns referenced by the portable edge
--      functions (no-op on databases where they already exist).
--   2. get_validation_policy() — SECURITY DEFINER RPC returning the policy
--      JSONB for the calling user.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Reconcile license/profile columns used by portable edge functions
--    (validate-license, validate-session, device-login, approve-license,
--     reject-license, reports, ...). All are ADD COLUMN IF NOT EXISTS so this
--    is a no-op on production where the columns already exist.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS license_status text,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_device text,
  ADD COLUMN IF NOT EXISTS last_login timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync timestamptz;

-- ---------------------------------------------------------------------------
-- 2. get_validation_policy() — server-authoritative validation policy.
--
-- Rules (all server-side, not client-side):
--   • normal:            validate every 24h, offline grace 7 days
--   • expiring_soon:     within 45 days of expiration → validate every 6h
--   • expiring_soon:     within 7 days of expiration → validate every 1h
--   • force_validation:  set when the account is suspended/blocked so the
--                        client surfaces an urgent non-blocking reminder
--
-- The client reads this via supabase.rpc("get_validation_policy") after every
-- successful device validation and uses the returned cadence/grace. If the
-- client is offline it simply cannot refresh it — offline behavior is bounded
-- by offline_grace_ms, which the server alone controls.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_validation_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_expiry timestamptz;
  v_remaining_days int;
  v_interval_hours int;
  v_policy text := 'normal';
  v_force boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT p.* INTO v_profile
    FROM public.profiles p
   WHERE p.user_id = auth.uid();

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_profile');
  END IF;

  v_expiry := v_profile.trial_end;
  IF v_profile.license_status IS DISTINCT FROM 'trial' THEN
    v_expiry := v_profile.expiry_date;
  END IF;

  v_remaining_days := NULL;
  IF v_expiry IS NOT NULL THEN
    v_remaining_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_expiry - v_now)) / 86400))::int;
  END IF;

  IF v_remaining_days IS NULL OR v_remaining_days > 45 THEN
    v_interval_hours := 24;
    v_policy := 'normal';
  ELSIF v_remaining_days > 7 THEN
    v_interval_hours := 6;
    v_policy := 'expiring_soon';
  ELSE
    v_interval_hours := 1;
    v_policy := 'expiring_soon';
  END IF;

  IF v_profile.license_status = 'permanent' THEN
    v_policy := 'normal';
  END IF;

  IF v_profile.account_status IN ('suspended', 'blocked')
     OR v_profile.license_status IN ('blocked', 'revoked', 'rejected') THEN
    v_force := true;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'minimum_validation_interval_ms', (v_interval_hours * 3600000)::bigint,
    'offline_grace_ms', (7 * 86400000)::bigint,
    'next_required_validation', to_char(
      v_now + make_interval(hours => v_interval_hours),
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'force_validation', v_force,
    'license_expiration', CASE WHEN v_expiry IS NULL THEN NULL
        ELSE to_char(v_expiry, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'revoked', (v_profile.license_status = 'revoked'),
    'validation_policy', v_policy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_validation_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO service_role;

COMMIT;

-- =============================================================================
-- Post-apply sanity check (run manually):
-- SELECT public.get_validation_policy();
-- =============================================================================
