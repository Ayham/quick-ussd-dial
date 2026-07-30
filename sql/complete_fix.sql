-- ============================================================================
-- COMPLETE LICENSING SYSTEM SETUP + BACKFILL
-- Run this entire script in Supabase SQL Editor (one execution).
-- Safe to run multiple times (idempotent).
-- ============================================================================

-- 1. CREATE LICENSE_TYPE ENUM (if not exists)
DO $$ BEGIN
  CREATE TYPE public.license_type AS ENUM ('trial', 'days_30', 'days_90', 'days_180', 'days_365', 'permanent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. EXTEND LICENSE_STATUS ENUM (new values in a separate DO block to avoid
--    PostgreSQL's "unsafe use of new value" error within the same transaction)
DO $$ BEGIN
  ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'trial';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'permanent';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'blocked';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. EXTEND PROFILES TABLE (add licensing columns if missing)
--    Use TEXT type first to avoid enum dependency in ADD COLUMN DEFAULT,
--    then cast to enum later.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS license_type TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS current_device TEXT,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

-- 4. NOTE: Columns stay as TEXT to avoid PostgreSQL's "unsafe use of new enum value in same transaction"
--    error. The RPC functions cast enum parameters to TEXT when writing to these columns.

CREATE INDEX IF NOT EXISTS idx_profiles_license_status ON public.profiles(license_status);
CREATE INDEX IF NOT EXISTS idx_profiles_expiry_date ON public.profiles(expiry_date);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

-- 5. UPDATE handle_new_user TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _trial_end TIMESTAMPTZ;
BEGIN
  _trial_end := now() + INTERVAL '15 days';
  INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), now(), _trial_end, 'trial', 'trial', 'active');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

-- 6. RPC: get_user_license_status (with auto-create profile if missing)
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
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true WHEN _profile.license_status IN ('expired', 'rejected', 'blocked') THEN true ELSE false END
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_user_license_status FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_user_license_status TO authenticated;

-- 7. RPC: admin_get_all_users_license (with auto-create profiles for auth users)
CREATE OR REPLACE FUNCTION public.admin_get_all_users_license(_search TEXT DEFAULT NULL, _status TEXT DEFAULT NULL, _page INTEGER DEFAULT 1, _page_size INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _offset INTEGER := (_page - 1) * _page_size; _total BIGINT; _users JSONB;
BEGIN
  PERFORM public._require_admin();
  INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
  SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', au.email), COALESCE(au.created_at, now()), COALESCE(au.created_at, now()) + INTERVAL '15 days', 'trial', 'trial', 'active'
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT count(*) INTO _total FROM public.profiles;
  SELECT jsonb_agg(sub) INTO _users FROM (
    SELECT p.user_id, p.display_name, p.email, p.phone, p.created_at, p.trial_start, p.trial_end, p.license_status, p.license_type, p.expiry_date, p.current_device, p.last_login, p.last_sync, p.account_status,
      CASE WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM p.trial_end - now())::INTEGER) ELSE NULL END AS trial_remaining_days
    FROM public.profiles p WHERE (_search IS NULL OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%')
      AND (_status IS NULL OR p.license_status::TEXT = _status) ORDER BY p.created_at DESC LIMIT _page_size OFFSET _offset
  ) sub;
  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::JSONB), 'total', _total, 'page', _page, 'page_size', _page_size);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_users_license(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- 8. RPC: admin_set_license
CREATE OR REPLACE FUNCTION public.admin_set_license(_target_user_id UUID, _license_status public.license_status, _license_type public.license_type DEFAULT NULL, _expiry_date DATE DEFAULT NULL, _notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin_id UUID;
BEGIN
  _admin_id := public._require_admin();
  UPDATE public.profiles SET license_status = _license_status::TEXT, license_type = COALESCE(_license_type::TEXT, license_type), expiry_date = _expiry_date, account_status = CASE WHEN _license_status IN ('active', 'permanent', 'trial') THEN 'active' WHEN _license_status IN ('suspended', 'blocked') THEN _license_status::TEXT ELSE account_status END, updated_at = now()
  WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (_admin_id, 'set_license', 'user', _target_user_id::TEXT, jsonb_build_object('license_status', _license_status::TEXT, 'license_type', COALESCE(_license_type::TEXT, NULL), 'expiry_date', _expiry_date, 'notes', _notes));
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_license(UUID, public.license_status, public.license_type, DATE, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_set_license(UUID, public.license_status, public.license_type, DATE, TEXT) TO authenticated;

-- 9. RPC: admin_extend_trial (drop old text overload first to avoid ambiguity)
DROP FUNCTION IF EXISTS public.admin_extend_trial(TEXT, INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION public.admin_extend_trial(_target_user_id UUID, _extra_days INTEGER DEFAULT 7)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin_id UUID; _new_end TIMESTAMPTZ;
BEGIN
  _admin_id := public._require_admin();
  SELECT COALESCE(trial_end, now()) + (_extra_days || ' days')::INTERVAL INTO _new_end FROM public.profiles WHERE user_id = _target_user_id;
  UPDATE public.profiles SET trial_end = _new_end, updated_at = now() WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (_admin_id, 'extend_trial', 'user', _target_user_id::TEXT, jsonb_build_object('extra_days', _extra_days, 'new_trial_end', _new_end));
  RETURN jsonb_build_object('success', true, 'new_trial_end', _new_end);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial(UUID, INTEGER) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(UUID, INTEGER) TO authenticated;

-- 10. RPC: admin_suspend_user
CREATE OR REPLACE FUNCTION public.admin_suspend_user(_target_user_id UUID, _status TEXT DEFAULT 'suspended', _reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin_id UUID;
BEGIN
  _admin_id := public._require_admin();
  IF _status NOT IN ('suspended', 'blocked', 'active') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE public.profiles SET account_status = _status, updated_at = now() WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (_admin_id, 'suspend_user', 'user', _target_user_id::TEXT, jsonb_build_object('status', _status, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', _status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT, TEXT) TO authenticated;

-- 11. RPC: get_activation_requests
CREATE OR REPLACE FUNCTION public.get_activation_requests(_status TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_admin BOOLEAN; _result JSONB;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin');
  IF _is_admin THEN
    SELECT jsonb_agg(sub) INTO _result FROM (
      SELECT a.id, a.request_token, a.user_id, a.status, a.contact_name, a.contact_phone, a.notes, a.created_at, a.processed_at, a.processed_by, p.display_name, p.email, p.phone AS profile_phone, p.license_status, p.trial_end, p.trial_start
      FROM public.activations a LEFT JOIN public.profiles p ON p.user_id = a.user_id
      WHERE (_status IS NULL OR a.status::TEXT = _status) ORDER BY a.created_at DESC
    ) sub;
  ELSE
    SELECT jsonb_agg(sub) INTO _result FROM (
      SELECT a.id, a.request_token, a.status, a.notes, a.created_at, a.processed_at
      FROM public.activations a WHERE a.user_id = auth.uid() AND (_status IS NULL OR a.status::TEXT = _status)
    ) sub;
  END IF;
  RETURN jsonb_build_object('requests', COALESCE(_result, '[]'::JSONB));
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_activation_requests(TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_activation_requests(TEXT) TO authenticated;

-- 12. RPC: log_last_login
CREATE OR REPLACE FUNCTION public.log_last_login()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.profiles SET last_login = now() WHERE user_id = auth.uid(); RETURN jsonb_build_object('success', true); END; $$;
REVOKE EXECUTE ON FUNCTION public.log_last_login FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.log_last_login TO authenticated;

-- 13. RPC: get_pending_activation_request
CREATE OR REPLACE FUNCTION public.get_pending_activation_request()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('has_pending', EXISTS(SELECT 1 FROM public.activations WHERE user_id = auth.uid() AND status = 'pending'));
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_pending_activation_request FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_pending_activation_request TO authenticated;

-- 14. RPC: admin_get_activation_history
CREATE OR REPLACE FUNCTION public.admin_get_activation_history(_target_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin_id UUID; _result JSONB;
BEGIN
  _admin_id := public._require_admin();
  SELECT jsonb_agg(sub ORDER BY a.created_at DESC) INTO _result FROM (
    SELECT a.id, a.action, a.target_id, a.details, a.created_at FROM public.admin_actions a WHERE a.target_type = 'user' AND (a.target_id = _target_user_id::TEXT OR a.target_id IS NULL)
  ) sub;
  RETURN jsonb_build_object('history', COALESCE(_result, '[]'::JSONB));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_activation_history(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_activation_history(UUID) TO authenticated;

-- 15. RPC: admin_get_license_summary
CREATE OR REPLACE FUNCTION public.admin_get_license_summary()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin_id UUID; _result JSONB;
BEGIN
  _admin_id := public._require_admin();
  SELECT jsonb_build_object('total', COUNT(*), 'trial', COUNT(*) FILTER (WHERE license_status = 'trial'), 'active', COUNT(*) FILTER (WHERE license_status = 'active'), 'expired', COUNT(*) FILTER (WHERE license_status IN ('expired', 'trial') AND trial_end < now()), 'permanent', COUNT(*) FILTER (WHERE license_status = 'permanent'), 'suspended', COUNT(*) FILTER (WHERE account_status = 'suspended'), 'blocked', COUNT(*) FILTER (WHERE account_status = 'blocked'), 'pending_activations', (SELECT COUNT(*) FROM public.activations WHERE status = 'pending'))
  INTO _result FROM public.profiles;
  RETURN _result;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_get_license_summary FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_license_summary TO authenticated;

-- 16. UPDATE _require_admin: auto-promote first user calling it
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role);
      RETURN v_uid;
    END IF;
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END; $$;

-- 17. RPC: admin_repair_self
CREATE OR REPLACE FUNCTION public.admin_repair_self()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_already_exists');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'promoted', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_repair_self FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_repair_self TO authenticated;

-- ============================================================================
-- BACKFILL: populate existing auth users
-- ============================================================================

-- 18. Backfill missing profiles
INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'display_name', au.email),
  COALESCE(au.created_at, now()), COALESCE(au.created_at, now()) + INTERVAL '15 days', 'trial', 'trial', 'active'
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
ON CONFLICT (user_id) DO NOTHING;

-- 19. Fix trial dates for existing profiles
UPDATE public.profiles
SET trial_start = COALESCE(trial_start, created_at, now()),
    trial_end   = COALESCE(trial_end, (COALESCE(created_at, now()) + INTERVAL '15 days'))
WHERE license_status = 'trial' AND (trial_start IS NULL OR trial_end IS NULL);

-- 20. Ensure every user has a role entry
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'user'::app_role FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id)
ON CONFLICT DO NOTHING;

-- 21. If no admin exists, promote the first user
WITH first_user AS (SELECT au.id FROM auth.users au ORDER BY au.created_at ASC LIMIT 1)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM first_user
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- 22. Ensure RLS policy for activations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own activations' AND tablename = 'activations') THEN
    CREATE POLICY "Users read own activations" ON public.activations FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
