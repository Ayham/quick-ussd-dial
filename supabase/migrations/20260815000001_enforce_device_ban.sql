-- ============================================================================
-- Device-ban enforcement in validate_device_session + get_validation_policy.
-- Closes the gap where a banned/blocked bound device could still transfer:
-- validate_device_session returned valid=true because it only checked the
-- binding match, never the device row's is_blocked / is_banned state.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _device_banned BOOLEAN;
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'profile_not_found',
      'error', 'لم يتم العثور على الملف الشخصي / Profile not found'
    );
  END IF;

  IF _profile.account_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_suspended',
      'error', 'الحساب موقوف / Account suspended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.account_status = 'blocked' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_blocked',
      'error', 'الحساب محظور / Account blocked',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_' || _profile.license_status,
      'error', CASE _profile.license_status
        WHEN 'expired' THEN 'انتهت صلاحية الترخيص / License expired'
        WHEN 'rejected' THEN 'تم رفض التفعيل / Activation rejected'
        WHEN 'blocked' THEN 'الترخيص محظور / License blocked'
        WHEN 'revoked' THEN 'تم إلغاء الترخيص / License revoked'
        WHEN 'pending' THEN 'الترخيص قيد المراجعة / License pending review'
        WHEN 'inactive' THEN 'الترخيص غير مفعل / License inactive'
        ELSE 'الترخيص غير صالح / Invalid license'
      END,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'trial_expired',
      'error', 'انتهت الفترة التجريبية / Trial period ended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'trial_end', _profile.trial_end
    );
  END IF;

  IF _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND _profile.expiry_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_expired',
      'error', 'انتهت صلاحية الترخيص / License expired',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'expiry_date', _profile.expiry_date
    );
  END IF;

  -- NEW: reject when the bound device has been banned/blocked by an admin.
  -- Checked against the profile's bound device (not the caller-supplied id)
  -- so a banned device cannot be bypassed by passing a different device id.
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
        'current_device', _profile.current_device
      );
    END IF;
  END IF;

  IF _profile.current_device IS NOT NULL AND _profile.current_device != _device_id THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'device_mismatch',
      'error', 'هذا الحساب مسجل على جهاز آخر / This account is registered on another device',
      'current_device', _profile.current_device,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  -- Record the last successful server validation for admin visibility.
  UPDATE public.profiles SET last_sync = _now WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'valid', true, 'reason', 'ok',
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name,
    'license_status', _profile.license_status, 'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date, 'current_device', _profile.current_device,
    'account_status', _profile.account_status,
    'trial_start', _profile.trial_start, 'trial_end', _profile.trial_end,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true
      WHEN _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN true ELSE false END
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_device_session FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.validate_device_session TO authenticated;

-- Force the client to re-validate immediately when the bound device is banned.
CREATE OR REPLACE FUNCTION public.get_validation_policy()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _policy JSONB;
  _device_banned BOOLEAN;
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
      WHEN _profile.license_status IN ('blocked', 'revoked', 'rejected') THEN 'force'
      WHEN _device_banned THEN 'force'
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND (_profile.trial_end - now()) < INTERVAL '45 days' THEN 'expiring_soon'
      WHEN _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND (_profile.expiry_date - now()) < INTERVAL '45 days' THEN 'expiring_soon'
      ELSE 'normal'
    END
  );

  RETURN _policy;
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_validation_policy() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated;
