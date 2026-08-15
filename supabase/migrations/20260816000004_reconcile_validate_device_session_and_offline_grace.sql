-- ============================================================================
-- Reconciliation migration: re-apply the FINAL, unified function bodies for
-- get_validation_policy and validate_device_session.
--
-- The earlier 20260816000001/20260816000002 migrations were applied before the
-- license_status = 'suspended' alignment edits landed locally, so the remote
-- definitions drifted from the unified matrix. These CREATE OR REPLACE bodies
-- are idempotent and guarantee remote == local == edge functions == client.
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

  _expiry_ms := CASE
    WHEN _expiry IS NOT NULL THEN EXTRACT(EPOCH FROM (_expiry - _now))::BIGINT * 1000
    ELSE NULL
  END;

  -- offline_grace_ms mirrors the ACTUAL remaining offline validity:
  --   • account/locked-license states → 0
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

CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _device_banned BOOLEAN;
  _can_transfer BOOLEAN;
  _reason TEXT;
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'profile_not_found',
      'error', 'لم يتم العثور على الملف الشخصي / Profile not found'
    );
  END IF;

  -- Account status checks (highest priority — force local sign-out).
  IF _profile.account_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_suspended',
      'error', 'الحساب موقوف / Account suspended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'can_open_app', false, 'can_transfer', false, 'requires_logout', true, 'is_locked', true
    );
  END IF;

  IF _profile.account_status = 'blocked' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_blocked',
      'error', 'الحساب محظور / Account blocked',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'can_open_app', false, 'can_transfer', false, 'requires_logout', true, 'is_locked', true
    );
  END IF;

  -- License-level lock: license_status = 'suspended' blocks everything and
  -- forces a local sign-out (mirrors computeLicenseDecision()).
  IF _profile.license_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'suspended',
      'error', 'الترخيص موقوف / License suspended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'can_open_app', false, 'can_transfer', false, 'requires_logout', true, 'is_locked', true
    );
  END IF;

  -- Device-ban enforcement (admin-blocked / banned device).
  IF _profile.current_device IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.devices
      WHERE device_id = _profile.current_device
        AND (is_blocked OR is_banned OR lifecycle_state = 'blocked')
    ) INTO _device_banned;
    IF _device_banned THEN
      RETURN jsonb_build_object(
        'valid', false, 'reason', 'device_banned',
        'error', 'الجهاز محظور / Device banned',
        'license_status', _profile.license_status, 'account_status', _profile.account_status,
        'current_device', _profile.current_device,
        'can_open_app', false, 'can_transfer', false, 'requires_logout', false, 'is_locked', true
      );
    END IF;
  END IF;

  IF _profile.current_device IS NOT NULL AND _profile.current_device != _device_id THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'device_mismatch',
      'error', 'هذا الحساب مسجل على جهاز آخر / This account is registered on another device',
      'current_device', _profile.current_device,
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'can_open_app', false, 'can_transfer', false, 'requires_logout', false, 'is_locked', true
    );
  END IF;

  -- License states below keep the app USABLE (can_open_app = true) while
  -- blocking protected transfers. This mirrors computeLicenseDecision() in the
  -- edge functions: only account/locked-license states sign the user out.
  IF _profile.license_status = 'trial' THEN
    IF _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN
      _can_transfer := false; _reason := 'trial_ended';
    ELSE
      _can_transfer := true; _reason := 'ok';
    END IF;
  ELSIF _profile.license_status = 'active' THEN
    IF _profile.expiry_date IS NOT NULL AND _profile.expiry_date < CURRENT_DATE THEN
      _can_transfer := false; _reason := 'expired';
    ELSE
      _can_transfer := true; _reason := 'ok';
    END IF;
  ELSIF _profile.license_status = 'permanent' THEN
    _can_transfer := true; _reason := 'ok';
  ELSIF _profile.license_status = 'expired' THEN
    _can_transfer := false; _reason := 'expired';
  ELSIF _profile.license_status = 'rejected' THEN
    _can_transfer := false; _reason := 'activation_rejected';
  ELSIF _profile.license_status = 'pending' THEN
    _can_transfer := false; _reason := 'activation_pending';
  ELSIF _profile.license_status = 'inactive' THEN
    _can_transfer := false; _reason := 'inactive';
  ELSIF _profile.license_status = 'revoked' THEN
    _can_transfer := false; _reason := 'license_revoked';
  ELSIF _profile.license_status = 'blocked' THEN
    _can_transfer := false; _reason := 'license_blocked';
  ELSE
    _can_transfer := false; _reason := 'unknown_status';
  END IF;

  -- Record the last successful server validation for admin visibility.
  UPDATE public.profiles SET last_sync = _now WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'valid', true, 'reason', _reason,
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name,
    'license_status', _profile.license_status, 'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date, 'current_device', _profile.current_device,
    'account_status', _profile.account_status,
    'trial_start', _profile.trial_start, 'trial_end', _profile.trial_end,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'can_open_app', true,
    'can_transfer', _can_transfer,
    'requires_logout', false,
    'is_locked', false
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_device_session FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.validate_device_session TO authenticated;
