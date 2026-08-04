-- validate_device_session(_device_id TEXT)
-- Validates that the current device matches the user's registered device,
-- and checks license/account status. Returns JSONB with validation result.
-- Safe to run multiple times.
CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
 RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _result JSONB;
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

  IF _profile.license_status IN ('expired', 'rejected', 'blocked') THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_' || _profile.license_status,
      'error', CASE _profile.license_status
        WHEN 'expired' THEN 'انتهت صلاحية الترخيص / License expired'
        WHEN 'rejected' THEN 'تم رفض التفعيل / Activation rejected'
        WHEN 'blocked' THEN 'الترخيص محظور / License blocked'
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

  IF _profile.current_device IS NOT NULL AND _profile.current_device != _device_id THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'device_mismatch',
      'error', 'هذا الحساب مسجل على جهاز آخر / This account is registered on another device',
      'current_device', _profile.current_device,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 'reason', 'ok',
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name,
    'license_status', _profile.license_status, 'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date, 'current_device', _profile.current_device,
    'account_status', _profile.account_status,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true
      WHEN _profile.license_status IN ('expired', 'rejected', 'blocked') THEN true ELSE false END
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_device_session FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.validate_device_session TO authenticated;
