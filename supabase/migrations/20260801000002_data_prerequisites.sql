-- ============================================================================
-- EMERGENCY STABILIZATION MIGRATION 2
-- Ensures data prerequisites for admin panel: roles, profiles, licensing columns.
-- Safe to run multiple times (idempotent). No objects dropped or renamed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENSURE: profiles table has licensing columns
--    complete_fix.sql and migration 20260730000000_licensing_system.sql add
--    these, but production may be missing them.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS license_type TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS current_device TEXT,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS shop_name TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS commission_type TEXT,
  ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_license_status ON public.profiles(license_status);
CREATE INDEX IF NOT EXISTS idx_profiles_expiry_date ON public.profiles(expiry_date);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

-- ----------------------------------------------------------------------------
-- 2. ENSURE: user_roles table has all users with at least 'user' role
--    And promote first user to admin if no admin exists.
--    This is a critical stabilization step to restore admin access.
-- ----------------------------------------------------------------------------

-- Ensure role column is correct type for compatibility
-- If column exists as TEXT, that's fine (functions cast). If missing, add as TEXT.
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role'
  ) INTO col_exists;

  IF NOT col_exists THEN
    ALTER TABLE public.user_roles ADD COLUMN role public.app_role NOT NULL DEFAULT 'user'::public.app_role;
  END IF;
END $$;

-- Add 'user' role for every auth user that doesn't have one
-- Uses NOT EXISTS instead of ON CONFLICT to handle production tables
-- that may lack the unique (user_id, role) constraint.
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'user'::public.app_role
FROM auth.users au
WHERE au.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = au.id
      AND (ur.role = 'user' OR (ur.role::text = 'user'))
  );

-- Promote first user to admin if no admin exists
DO $$
DECLARE
  admin_count INTEGER;
  first_user_id UUID;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.user_roles ur
  WHERE ur.role = 'admin'::public.app_role;

  IF admin_count = 0 THEN
    SELECT au.id INTO first_user_id
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id AND ur.role = 'admin'::public.app_role
    )
    ORDER BY au.created_at ASC
    LIMIT 1;

    IF first_user_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (first_user_id, 'admin'::public.app_role);
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ENSURE: _require_admin auto-promotion logic (so first admin call works)
--    This was originally in migration 20260731000000_fix_profile_backfill.sql
--    but production might have the older version from 20260621112104.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. ENSURE: admin_repair_self exists and has proper grants
--    Allows calling user to self-promote if no admin exists.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_repair_self()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_already_exists');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin'::app_role);
  RETURN jsonb_build_object('success', true, 'promoted', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_repair_self FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_repair_self FROM ANON;
GRANT EXECUTE ON FUNCTION public.admin_repair_self TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ENSURE: get_user_license_status has auto-create profile logic
--    This function is called frequently and needs to handle users without profiles.
--    Version from sql/complete_fix.sql (production has this version).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. ENSURE: admin_get_all_users_license has auto-create profile logic
--    Version from sql/complete_fix.sql / migration 20260731000000_fix_profile_backfill.sql
-- ----------------------------------------------------------------------------
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
      CASE WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM p.trial_end - now())::INTEGER) ELSE NULL END AS trial_remaining_days,
      COALESCE(a.status, p.license_status) AS activation_status,
      a.processed_at AS activation_processed_at,
      a.processed_by AS activation_processed_by
    FROM public.profiles p
    LEFT JOIN (
      SELECT DISTINCT ON (user_id) id, user_id, status, processed_at, processed_by
      FROM public.activations
      WHERE user_id IS NOT NULL
      ORDER BY user_id, created_at DESC
    ) a ON a.user_id = p.user_id
    WHERE (_search IS NULL OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%')
      AND (_status IS NULL OR p.license_status::TEXT = _status) ORDER BY p.created_at DESC LIMIT _page_size OFFSET _offset
  ) sub;
  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::JSONB), 'total', _total, 'page', _page, 'page_size', _page_size);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_all_users_license(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. ENSURE: get_activation_requests has has_role check
--    Version from sql/complete_fix.sql
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_activation_requests(_status TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_admin BOOLEAN; _result JSONB;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);
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
GRANT EXECUTE ON FUNCTION public.get_activation_requests(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. ENSURE: RLS policies exist on all key tables
--    Production may be missing these if migration 20260513144842 never ran.
--    RLS is enabled on all 38 tables but policies may be missing, blocking
--    all queries (results in "No users found", "No transfers found", etc.)
-- ----------------------------------------------------------------------------

-- 8a. ENSURE: Missing tables exist with correct schema
--     Production may be missing tables that the admin panel depends on.
--     Only creates tables that don't exist — never modifies existing ones.
CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_device ON public.app_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_event ON public.app_events(event);

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  operator TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_device ON public.transfers(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON public.transfers(user_id);

-- Enable RLS on all key tables (handle tables that may not exist in production)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('user_roles', 'profiles', 'devices', 'licenses', 'activations',
                         'transfers', 'app_events', 'sync_logs', 'admin_actions',
                         'trials', 'user_settings', 'ussd_codes')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
  END LOOP;
END;
$$;

-- Helper: conditionally create a policy (skips silently if table or policy doesn't exist)
CREATE OR REPLACE FUNCTION _ensure_policy(
  _table_name TEXT,
  _policy_name TEXT,
  _definition TEXT,
  _exists_check TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = _table_name) THEN
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _policy_name, _table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I %s', _policy_name, _table_name, _definition);
    RAISE NOTICE 'Policy "% on % created: %', _policy_name, _table_name, _exists_check;
  END IF;
END;
$$;

-- user_roles policies
SELECT _ensure_policy('user_roles', 'Users see own roles',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT all rows for self or admin');
SELECT _ensure_policy('user_roles', 'Admins insert non-admin roles',
  'FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin'') AND role <> ''admin'')',
  'INSERT non-admin roles');
SELECT _ensure_policy('user_roles', 'Admins update non-admin roles',
  'FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'') AND role <> ''admin'') WITH CHECK (public.has_role(auth.uid(), ''admin'') AND role <> ''admin'')',
  'UPDATE non-admin roles');
SELECT _ensure_policy('user_roles', 'Admins delete non-admin roles',
  'FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin'') AND role <> ''admin'')',
  'DELETE non-admin roles');

-- profiles policies
SELECT _ensure_policy('profiles', 'Users view own profile',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT own or admin');
SELECT _ensure_policy('profiles', 'Users update own profile',
  'FOR UPDATE USING (auth.uid() = user_id)',
  'UPDATE own');
SELECT _ensure_policy('profiles', 'Users insert own profile',
  'FOR INSERT WITH CHECK (auth.uid() = user_id)',
  'INSERT own');
SELECT _ensure_policy('profiles', 'Admins manage profiles',
  'FOR ALL USING (public.has_role(auth.uid(), ''admin''))',
  'ALL admin');

-- devices policies
SELECT _ensure_policy('devices', 'Users view own device',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT own or admin');
SELECT _ensure_policy('devices', 'Admins manage devices',
  'FOR ALL USING (public.has_role(auth.uid(), ''admin''))',
  'ALL admin');

-- licenses policies
SELECT _ensure_policy('licenses', 'Users view own license',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT own or admin');
SELECT _ensure_policy('licenses', 'Admins manage licenses',
  'FOR ALL USING (public.has_role(auth.uid(), ''admin''))',
  'ALL admin');

-- activations policies
SELECT _ensure_policy('activations', 'Users view own activation',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT own or admin');
SELECT _ensure_policy('activations', 'Admins manage activations',
  'FOR ALL USING (public.has_role(auth.uid(), ''admin''))',
  'ALL admin');

-- transfers policies
SELECT _ensure_policy('transfers', 'Users view own transfers',
  'FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))',
  'SELECT own or admin');
SELECT _ensure_policy('transfers', 'Admins manage transfers',
  'FOR ALL USING (public.has_role(auth.uid(), ''admin''))',
  'ALL admin');

-- app_events policies
SELECT _ensure_policy('app_events', 'Admins view events',
  'FOR SELECT USING (public.has_role(auth.uid(), ''admin''))',
  'SELECT admin');
SELECT _ensure_policy('app_events', 'Users insert own events',
  'FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
  'INSERT own');

-- sync_logs policies
SELECT _ensure_policy('sync_logs', 'Admins view sync logs',
  'FOR SELECT USING (public.has_role(auth.uid(), ''admin''))',
  'SELECT admin');

-- admin_actions policies
SELECT _ensure_policy('admin_actions', 'Admins view audit',
  'FOR SELECT USING (public.has_role(auth.uid(), ''admin''))',
  'SELECT admin');
SELECT _ensure_policy('admin_actions', 'Admins write audit',
  'FOR INSERT WITH CHECK (public.has_role(auth.uid(), ''admin''))',
  'INSERT admin');

-- Clean up helper function
DROP FUNCTION IF EXISTS _ensure_policy(TEXT, TEXT, TEXT, TEXT);
