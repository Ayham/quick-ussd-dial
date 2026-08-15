-- ============================================================================
-- Align get_user_license_status.is_locked with the UNIFIED decision matrix.
--
-- Only account-level locks (account suspended/blocked) and the license-level
-- lock (license_status = 'suspended') produce is_locked = true. License states
-- that keep the app usable (expired / rejected / blocked / revoked / pending /
-- inactive, and trial-ended) must report is_locked = false — matching the
-- validate-license / validate-session edge functions and the client
-- license-decision.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_license_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _profile RECORD; _now CONSTANT TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
    SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', au.email), _now, _now + INTERVAL '15 days', 'trial', 'trial', 'active'
    FROM auth.users au WHERE au.id = auth.uid()
    RETURNING * INTO _profile;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'auth_user_not_found'); END IF;
  END IF;
  RETURN jsonb_build_object(
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name, 'phone', _profile.phone,
    'trial_start', _profile.trial_start, 'trial_end', _profile.trial_end,
    'license_status', _profile.license_status, 'license_type', _profile.license_type, 'expiry_date', _profile.expiry_date,
    'current_device', _profile.current_device, 'last_login', _profile.last_login, 'last_sync', _profile.last_sync, 'account_status', _profile.account_status,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'suspended' THEN true
      ELSE false END
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_user_license_status FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_user_license_status TO authenticated;
