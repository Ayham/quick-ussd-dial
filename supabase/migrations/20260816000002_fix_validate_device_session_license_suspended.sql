-- ============================================================================
-- Align validate_device_session with the UNIFIED decision matrix used by the
-- validate-license / validate-session edge functions and the client
-- license-decision.ts. The spec mandates identical state logic across the
-- Edge Functions, RPCs, and the Frontend.
--
-- Unified matrix:
--   • account suspended / blocked                    → valid:false (logout)
--   • license_status = 'suspended'                   → valid:false (logout)
--   • device banned                                  → valid:false (device-level)
--   • device mismatch                                → valid:false (device-level)
--   • license expired / rejected / blocked / revoked / pending / inactive
--     and trial-ended / date-expired licenses        → valid:true (app stays
--       usable) but can_transfer:false (transfers blocked)
--   • trial active / active valid / permanent        → valid:true, can_transfer:true
-- ============================================================================

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
