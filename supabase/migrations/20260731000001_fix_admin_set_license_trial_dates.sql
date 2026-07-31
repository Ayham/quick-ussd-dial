-- Fix admin_set_license to set trial_start/trial_end when license_status is 'trial'
CREATE OR REPLACE FUNCTION public.admin_set_license(
  _target_user_id UUID,
  _license_status public.license_status,
  _license_type public.license_type DEFAULT NULL,
  _expiry_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
  _trial_end TIMESTAMPTZ;
BEGIN
  _admin_id := public._require_admin();
  IF _license_status = 'trial' THEN
    _trial_end := now() + INTERVAL '15 days';
  END IF;
  UPDATE public.profiles
  SET
    license_status = _license_status,
    license_type = COALESCE(_license_type, license_type),
    expiry_date = _expiry_date,
    trial_start = CASE
      WHEN _license_status = 'trial' AND trial_start IS NULL THEN now()
      ELSE trial_start
    END,
    trial_end = CASE
      WHEN _license_status = 'trial' THEN COALESCE(_trial_end, trial_end)
      ELSE trial_end
    END,
    account_status = CASE
      WHEN _license_status IN ('active', 'permanent', 'trial') THEN 'active'
      WHEN _license_status IN ('suspended', 'blocked') THEN _license_status::TEXT
      ELSE account_status
    END,
    updated_at = now()
  WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (
    _admin_id, 'set_license', 'user', _target_user_id::TEXT,
    jsonb_build_object(
      'license_status', _license_status::TEXT,
      'license_type', COALESCE(_license_type::TEXT, NULL),
      'expiry_date', _expiry_date,
      'notes', _notes
    )
  );
  RETURN jsonb_build_object('success', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_set_license TO authenticated;