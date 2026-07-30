-- ============================================================================
-- Licensing & Authentication System
-- Adds: extended license statuses, profile licensing fields, new RPCs,
--       updated handle_new_user trigger, device policy enforcement
-- ============================================================================

-- 1. EXTEND ENUMS
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'trial';
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'permanent';
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'blocked';

CREATE TYPE public.license_type AS ENUM ('trial', 'days_30', 'days_90', 'days_180', 'days_365', 'permanent');

-- 2. EXTEND PROFILES TABLE
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_status public.license_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS license_type public.license_type NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS current_device TEXT,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_license_status ON public.profiles(license_status);
CREATE INDEX IF NOT EXISTS idx_profiles_expiry_date ON public.profiles(expiry_date);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

-- 3. UPDATE handle_new_user TRIGGER to set trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _trial_end TIMESTAMPTZ;
BEGIN
  _trial_end := now() + INTERVAL '15 days';
  INSERT INTO public.profiles (
    user_id, email, display_name,
    trial_start, trial_end, license_status, license_type, account_status
  ) VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    now(), _trial_end, 'trial', 'trial', 'active'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

-- 4. RPC: get_user_license_status — returns current license info for the calling user
CREATE OR REPLACE FUNCTION public.get_user_license_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _result JSONB;
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;
  RETURN jsonb_build_object(
    'user_id', _profile.user_id,
    'email', _profile.email,
    'display_name', _profile.display_name,
    'phone', _profile.phone,
    'trial_start', _profile.trial_start,
    'trial_end', _profile.trial_end,
    'license_status', _profile.license_status,
    'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date,
    'current_device', _profile.current_device,
    'last_login', _profile.last_login,
    'last_sync', _profile.last_sync,
    'account_status', _profile.account_status,
    'trial_remaining_days', CASE
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER)
      ELSE NULL
    END,
    'is_locked', CASE
      WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true
      WHEN _profile.license_status IN ('expired', 'rejected', 'blocked') THEN true
      ELSE false
    END
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_user_license_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_license_status FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_user_license_status TO authenticated;

-- 5. RPC: admin_get_all_users_license — admin view all users with license info
CREATE OR REPLACE FUNCTION public.admin_get_all_users_license(
  _search TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _offset INTEGER := (_page - 1) * _page_size;
  _total BIGINT;
  _users JSONB;
BEGIN
  PERFORM public._require_admin();
  SELECT count(*) INTO _total FROM public.profiles;
  SELECT jsonb_agg(sub) INTO _users FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone,
      p.created_at, p.trial_start, p.trial_end,
      p.license_status, p.license_type, p.expiry_date,
      p.current_device, p.last_login, p.last_sync,
      p.account_status,
      CASE WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL
        THEN GREATEST(0, EXTRACT(DAY FROM p.trial_end - now())::INTEGER)
        ELSE NULL
      END AS trial_remaining_days
    FROM public.profiles p
    WHERE
      (_search IS NULL OR
        p.display_name ILIKE '%' || _search || '%' OR
        p.email ILIKE '%' || _search || '%' OR
        p.phone ILIKE '%' || _search || '%')
      AND (_status IS NULL OR p.license_status::TEXT = _status)
    ORDER BY p.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) sub;
  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::JSONB), 'total', _total, 'page', _page, 'page_size', _page_size);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_users_license FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_users_license FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license TO authenticated;

-- 6. RPC: admin_set_license — admin sets license status, type, expiry for a user
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
BEGIN
  _admin_id := public._require_admin();
  UPDATE public.profiles
  SET
    license_status = _license_status,
    license_type = COALESCE(_license_type, license_type),
    expiry_date = _expiry_date,
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
REVOKE EXECUTE ON FUNCTION public.admin_set_license FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_license FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_set_license TO authenticated;

-- 7. RPC: admin_extend_trial — extend trial for a user by N days
CREATE OR REPLACE FUNCTION public.admin_extend_trial(
  _target_user_id UUID,
  _extra_days INTEGER DEFAULT 7
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
  _new_end TIMESTAMPTZ;
BEGIN
  _admin_id := public._require_admin();
  SELECT COALESCE(trial_end, now()) + (_extra_days || ' days')::INTERVAL INTO _new_end
  FROM public.profiles WHERE user_id = _target_user_id;
  UPDATE public.profiles
  SET trial_end = _new_end, updated_at = now()
  WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (
    _admin_id, 'extend_trial', 'user', _target_user_id::TEXT,
    jsonb_build_object('extra_days', _extra_days, 'new_trial_end', _new_end)
  );
  RETURN jsonb_build_object('success', true, 'new_trial_end', _new_end);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial TO authenticated;

-- 8. RPC: admin_suspend_user — suspend or block a user account
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  _target_user_id UUID,
  _status TEXT DEFAULT 'suspended',
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
BEGIN
  _admin_id := public._require_admin();
  IF _status NOT IN ('suspended', 'blocked', 'active') THEN
    RAISE EXCEPTION 'invalid status: must be suspended, blocked, or active';
  END IF;
  UPDATE public.profiles
  SET account_status = _status, updated_at = now()
  WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (_admin_id, 'suspend_user', 'user', _target_user_id::TEXT,
    jsonb_build_object('status', _status, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', _status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user TO authenticated;

-- 9. RPC: get_activation_requests — user sees own; admin sees all pending
CREATE OR REPLACE FUNCTION public.get_activation_requests(
  _status TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_admin BOOLEAN;
  _result JSONB;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin');
  IF _is_admin THEN
    SELECT jsonb_agg(sub ORDER BY a.created_at DESC) INTO _result FROM (
      SELECT
        a.id, a.request_token, a.user_id, a.status,
        a.contact_name, a.contact_phone, a.notes,
        a.created_at, a.processed_at, a.processed_by,
        p.display_name, p.email, p.phone AS profile_phone,
        p.license_status, p.trial_end, p.trial_start
      FROM public.activations a
      LEFT JOIN public.profiles p ON p.user_id = a.user_id
      WHERE (_status IS NULL OR a.status::TEXT = _status)
      ORDER BY a.created_at DESC
    ) sub;
  ELSE
    SELECT jsonb_agg(sub ORDER BY a.created_at DESC) INTO _result FROM (
      SELECT a.id, a.request_token, a.status, a.notes, a.created_at, a.processed_at
      FROM public.activations a
      WHERE a.user_id = auth.uid()
        AND (_status IS NULL OR a.status::TEXT = _status)
    ) sub;
  END IF;
  RETURN jsonb_build_object('requests', COALESCE(_result, '[]'::JSONB));
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_activation_requests FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_activation_requests FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_activation_requests TO authenticated;

-- 10. RPC: log_last_login — updates last_login timestamp
CREATE OR REPLACE FUNCTION public.log_last_login()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET last_login = now() WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_last_login FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_last_login FROM ANON;
GRANT EXECUTE ON FUNCTION public.log_last_login TO authenticated;

-- 11. RPC: get_pending_activation_request — checks if user already has a pending request
CREATE OR REPLACE FUNCTION public.get_pending_activation_request()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _request RECORD;
BEGIN
  SELECT id, request_token, status, created_at
  INTO _request
  FROM public.activations
  WHERE user_id = auth.uid() AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_pending', false);
  END IF;
  RETURN jsonb_build_object(
    'has_pending', true,
    'id', _request.id,
    'request_token', _request.request_token,
    'status', _request.status,
    'created_at', _request.created_at
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_pending_activation_request FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_activation_request FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_pending_activation_request TO authenticated;

-- 12. RPC: admin_get_activation_history — get activation/action history for a user
CREATE OR REPLACE FUNCTION public.admin_get_activation_history(
  _target_user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
  _history JSONB;
BEGIN
  _admin_id := public._require_admin();
  SELECT jsonb_agg(sub ORDER BY created_at DESC) INTO _history FROM (
    SELECT action, created_at, details
    FROM public.admin_actions
    WHERE target_type = 'user' AND target_id = _target_user_id::TEXT
    UNION ALL
    SELECT 'activation_' || a.status::TEXT AS action, a.created_at,
      jsonb_build_object('status', a.status, 'notes', a.notes, 'processed_at', a.processed_at)
    FROM public.activations a
    WHERE a.user_id = _target_user_id
    ORDER BY created_at DESC
    LIMIT 50
  ) sub;
  RETURN jsonb_build_object('history', COALESCE(_history, '[]'::JSONB));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_activation_history FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_activation_history FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_activation_history TO authenticated;

-- 13. RPC: update_last_sync — updates last_sync timestamp
CREATE OR REPLACE FUNCTION public.update_last_sync()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET last_sync = now() WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_last_sync FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_last_sync FROM ANON;
GRANT EXECUTE ON FUNCTION public.update_last_sync TO authenticated;

-- 14. RPC: admin_get_license_summary — aggregate license stats for dashboard
CREATE OR REPLACE FUNCTION public.admin_get_license_summary()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
  _stats JSONB;
BEGIN
  _admin_id := public._require_admin();
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'trial_users', (SELECT count(*) FROM public.profiles WHERE license_status = 'trial'),
    'active_licenses', (SELECT count(*) FROM public.profiles WHERE license_status IN ('active', 'permanent')),
    'expired', (SELECT count(*) FROM public.profiles WHERE license_status IN ('expired', 'rejected', 'blocked')),
    'suspended', (SELECT count(*) FROM public.profiles WHERE account_status IN ('suspended', 'blocked')),
    'pending_activations', (SELECT count(*) FROM public.activations WHERE status = 'pending')
  ) INTO _stats;
  RETURN _stats;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_license_summary FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_license_summary FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_license_summary TO authenticated;

-- 15. Grant EXECUTE on all new functions to authenticated
GRANT EXECUTE ON FUNCTION public.get_user_license_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_license TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_activation_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_last_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_activation_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_activation_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_last_sync TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_license_summary TO authenticated;

-- 16. RLS: ensure profiles insert policy exists for trigger
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 17. RLS: ensure users can read their own license data
DROP POLICY IF EXISTS "Users view own license data" ON public.profiles;
CREATE POLICY "Users view own license data" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
