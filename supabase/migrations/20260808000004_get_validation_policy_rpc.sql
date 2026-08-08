-- ============================================================================
-- RPC: get_validation_policy
-- Returns the server-controlled validation policy for the current user.
-- This is called by the client to get the offline grace period, validation
-- interval, and force validation requirements. The policy is computed from
-- the user's profile license status and expiry dates.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_validation_policy()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _policy JSONB;
BEGIN
  -- Get the current user's profile
  SELECT
    license_status,
    license_type,
    trial_end,
    expiry_date,
    account_status
  INTO _profile
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Compute validation policy (mirrors the logic in validate-license Edge Function)
  _policy := jsonb_build_object(
    'minimum_validation_interval_ms', CASE
      WHEN _profile.license_status = 'permanent' THEN 24 * 3600000
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL THEN
        CASE
          WHEN (_profile.trial_end - now()) < INTERVAL '7 days' THEN 1 * 3600000
          WHEN (_profile.trial_end - now()) < INTERVAL '45 days' THEN 6 * 3600000
          ELSE 24 * 3600000
        END
      WHEN _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' THEN
        CASE
          WHEN (_profile.expiry_date - now()) < INTERVAL '7 days' THEN 1 * 3600000
          WHEN (_profile.expiry_date - now()) < INTERVAL '45 days' THEN 6 * 3600000
          ELSE 24 * 3600000
        END
      ELSE 24 * 3600000
    END,
    'offline_grace_ms', 7 * 86400000,
    'next_required_validation', to_char(now() + INTERVAL '24 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'force_validation', CASE
      WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status IN ('blocked', 'revoked', 'rejected') THEN true
      ELSE false
    END,
    'license_expiration', CASE
      WHEN _profile.license_status = 'trial' THEN _profile.trial_end
      ELSE _profile.expiry_date
    END,
    'revoked', _profile.license_status = 'revoked',
    'validation_policy', CASE
      WHEN _profile.license_status = 'permanent' THEN 'normal'
      WHEN _profile.account_status IN ('suspended', 'blocked') THEN 'force'
      WHEN _profile.license_status IN ('blocked', 'revoked', 'rejected') THEN 'force'
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND (_profile.trial_end - now()) < INTERVAL '45 days' THEN 'expiring_soon'
      WHEN _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND (_profile.expiry_date - now()) < INTERVAL '45 days' THEN 'expiring_soon'
      ELSE 'normal'
    END
  );

  RETURN _policy;
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_validation_policy() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated;