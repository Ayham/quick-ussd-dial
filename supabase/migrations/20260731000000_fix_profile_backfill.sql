-- Backfill: ensure every auth user has a profile row, a role, and trial dates.
-- Existing users created BEFORE the licensing migration (20260730000000)
-- may be missing profiles, roles, or have NULL trial_start/trial_end.

-- 1. Ensure every auth.user has a profile row
INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'display_name', au.email),
  COALESCE(au.created_at, now()),
  COALESCE(au.created_at, now()) + INTERVAL '15 days',
  'trial',
  'trial',
  'active'
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;

-- 2. Fix profiles that have 'trial' status but NULL trial_start/trial_end
UPDATE public.profiles
SET
  trial_start = COALESCE(trial_start, created_at, now()),
  trial_end   = COALESCE(trial_end, (COALESCE(created_at, now()) + INTERVAL '15 days'))
WHERE license_status = 'trial'
  AND (trial_start IS NULL OR trial_end IS NULL);

-- 3. Ensure every user has at least a 'user' role entry
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'user'::app_role
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id)
ON CONFLICT DO NOTHING;

-- 4. If no admin exists, promote the first user (by creation date) to admin
WITH first_user AS (
  SELECT au.id FROM auth.users au
  ORDER BY au.created_at ASC
  LIMIT 1
)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM first_user
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- 5. Update _require_admin: auto-promote first user calling it if no admin exists
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role);
      RETURN v_uid;
    END IF;
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END; $$;

-- 6. New RPC: admin_repair_self — calling user can promote themselves if no admin exists
CREATE OR REPLACE FUNCTION public.admin_repair_self()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_already_exists');
  END IF;
  IF public.has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', true, 'already_admin', true);
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'promoted', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_repair_self FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_repair_self FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_repair_self TO authenticated;

-- 7. Ensure roles exist for the calling user
INSERT INTO public.user_roles (user_id, role)
SELECT auth.uid(), 'user'::app_role
WHERE auth.uid() IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
ON CONFLICT DO NOTHING;

-- 8. Update get_user_license_status: auto-create profile if missing
CREATE OR REPLACE FUNCTION public.get_user_license_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _result JSONB;
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    -- Auto-create profile for existing auth user
    INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
    SELECT
      au.id, au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email),
      _now, _now + INTERVAL '15 days',
      'trial', 'trial', 'active'
    FROM auth.users au WHERE au.id = auth.uid()
    RETURNING * INTO _profile;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'auth_user_not_found');
    END IF;
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

-- 6. Update admin_get_all_users_license: ensure profiles exist
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
  -- Ensure all auth users have profiles before counting
  INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
  SELECT
    au.id, au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', au.email),
    COALESCE(au.created_at, now()),
    COALESCE(au.created_at, now()) + INTERVAL '15 days',
    'trial', 'trial', 'active'
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT count(*) INTO _total FROM public.profiles;
  SELECT jsonb_agg(sub) INTO _users FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone,
      p.created_at, p.trial_start, p.trial_end,
      p.license_status, p.license_type, p.expiry_date,
      p.current_device, p.last_login, p.last_sync,
      p.account_status,
      CASE
        WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL
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
