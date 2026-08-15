-- ============================================================================
-- Fix get_validation_policy: offline_grace_ms must mirror the ACTUAL remaining
-- offline validity derived from the real expiration date — never a flat grace
-- period that extends a license.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_validation_policy()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _policy JSONB;
  _device_banned BOOLEAN;
  _now CONSTANT TIMESTAMPTZ := now();
  _expiry TIMESTAMPTZ;
  _expiry_ms BIGINT;
  _offline_grace_ms BIGINT;
BEGIN
  SELECT
    license_status,
    license_type,
    trial_end,
    expiry_date,
    account_status,
    current_device
  INTO _profile
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  _device_banned := false;
  IF _profile.current_device IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.devices
      WHERE device_id = _profile.current_device
        AND (is_blocked OR is_banned OR lifecycle_state = 'blocked')
    ) INTO _device_banned;
  END IF;

  -- Determine the authoritative expiration boundary for this license
  _expiry := CASE
    WHEN _profile.license_status = 'trial' THEN _profile.trial_end
    ELSE _profile.expiry_date
  END;

  _expiry_ms := _expiry IS NOT NULL
    THEN EXTRACT(EPOCH FROM (_expiry - _now))::BIGINT * 1000
    ELSE NULL;

  -- offline_grace_ms mirrors the ACTUAL remaining offline validity:
  --   • blocked/suspended/revoked/rejected/expired/pending/inactive → 0
  --   • permanent → effectively indefinite (10 years in ms)
  --   • active/trial with a date → remaining time until expiry_date/trial_end
  --   • undated non-permanent (malformed/legacy) → fallback 7 days
  IF _profile.account_status IN ('suspended', 'blocked')
     OR _profile.license_status IN ('blocked', 'revoked', 'rejected', 'expired', 'pending', 'inactive', 'suspended')
     OR (_expiry_ms IS NOT NULL AND _expiry_ms <= 0) THEN
    _offline_grace_ms := 0;
  ELSIF _profile.license_status = 'permanent' THEN
    _offline_grace_ms := 3650 * 86400000; -- 10 years
  ELSIF _expiry_ms IS NOT NULL THEN
    _offline_grace_ms := GREATEST(0, _expiry_ms);
  ELSE
    _offline_grace_ms := 7 * 86400000; -- fallback for undated legacy profiles
  END IF;

  _policy := jsonb_build_object(
    'minimum_validation_interval_ms', CASE
      WHEN _profile.license_status = 'permanent' THEN 24 * 3600000
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL THEN
        CASE
          WHEN (_profile.trial_end - _now) < INTERVAL '7 days' THEN 1 * 3600000
          WHEN (_profile.trial_end - _now) < INTERVAL '45 days' THEN 6 * 3600000
          ELSE 24 * 3600000
        END
      WHEN _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' THEN
        CASE
          WHEN (_profile.expiry_date - _now) < INTERVAL '7 days' THEN 1 * 3600000
          WHEN (_profile.expiry_date - _now) < INTERVAL '45 days' THEN 6 * 3600000
          ELSE 24 * 3600000
        END
      ELSE 24 * 3600000
    END,
    'offline_grace_ms', _offline_grace_ms,
    'next_required_validation', to_char(_now + INTERVAL '24 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'force_validation', CASE
      WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status IN ('blocked', 'revoked', 'rejected', 'suspended') THEN true
      WHEN _device_banned THEN true
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
      WHEN _profile.license_status IN ('blocked', 'revoked', 'rejected', 'suspended') THEN 'force'
      WHEN _device_banned THEN 'force'
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND (_profile.trial_end - _now) < INTERVAL '45 days' THEN 'expiring_soon'
      WHEN _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND (_profile.expiry_date - _now) < INTERVAL '45 days' THEN 'expiring_soon'
      ELSE 'normal'
    END
  );

  RETURN _policy;
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_validation_policy() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated, service_role;

-- Also fix validate-license edge function to use the same logic (it already does)
-- Ensure the client-side license-decision.ts and license-cache.ts are aligned (they are)