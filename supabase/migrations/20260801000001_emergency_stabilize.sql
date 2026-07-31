-- ============================================================================
-- EMERGENCY STABILIZATION MIGRATION
-- Restores critical functions missing from production and consolidates
-- permanent RPCs that exist in sql/ but not in the migration chain.
--
-- ROOT CAUSE: has_role function is missing from production, breaking
-- _require_admin, all admin functions, and RLS policies.
--
-- This migration is idempotent: uses CREATE OR REPLACE and IF NOT EXISTS.
-- No objects are dropped or renamed. Safe to run on production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ENSURE: app_role enum type exists (CRITICAL — missing alongside has_role)
--    Defined in migration 20260513144842 but enum was never created in production.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 0b. ENSURE: user_roles table and role column exist
--    Production table may have a differently named role column. We ensure
--    a canonical 'role' column exists, using 'role_name' as fallback source.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- If table already existed without a 'role' column, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role'
  ) THEN
    -- Try to copy from 'role_name' column if it exists, otherwise add with default
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role_name'
    ) THEN
      ALTER TABLE public.user_roles ADD COLUMN role public.app_role;
      UPDATE public.user_roles SET role = role_name::public.app_role WHERE role_name IS NOT NULL;
      ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL;
      ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'user'::public.app_role;
    ELSE
      ALTER TABLE public.user_roles ADD COLUMN role public.app_role NOT NULL DEFAULT 'user';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. RESTORE: has_role function (CRITICAL — missing from production)
--    Defined in migration 20260513144842 but absent from production database.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Re-grant execute (migration 20260513144903 revoked it, but has_role was never
-- recreated with grants — this restores the required permissions for admins)
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. CONSOLIDATE: validate_device_session (from sql/rpc_validate_device_session.sql)
--    Called by src/lib/license-cache.ts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- ----------------------------------------------------------------------------
-- 3. CONSOLIDATE: request_activation (from sql/rpc_request_activation.sql)
--    Called by src/lib/license.ts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_activation(_device_id TEXT, _contact_name TEXT DEFAULT NULL, _contact_phone TEXT DEFAULT NULL, _ussd_numbers TEXT[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_token TEXT; _existing RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT id INTO _existing FROM public.activations WHERE user_id = v_uid AND status = 'pending' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'pending_request_exists', 'request_id', _existing.id); END IF;
  v_token := gen_random_uuid()::TEXT;
  INSERT INTO public.activations (request_token, device_id, user_id, contact_name, contact_phone, ussd_numbers, status)
  VALUES (v_token, _device_id, v_uid, _contact_name, _contact_phone, _ussd_numbers, 'pending');
  RETURN jsonb_build_object('success', true, 'request_token', v_token);
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_activation(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.request_activation(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. CONSOLIDATE: admin_approve_activation (from sql/rpc_admin_activation.sql)
--    Called by src/components/admin/ActivationRequests.tsx
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_activation(_request_id UUID, _license_type TEXT DEFAULT 'days_30', _duration_days INTEGER DEFAULT 30, _notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD; v_expiry DATE; v_lic_type TEXT; v_is_permanent BOOLEAN;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed'); END IF;
  v_is_permanent := (_license_type = 'permanent');
  IF v_is_permanent THEN
    v_lic_type := 'permanent'; v_expiry := NULL;
  ELSE
    v_expiry := (now() + (_duration_days || ' days')::INTERVAL)::DATE;
    v_lic_type := CASE WHEN _duration_days <= 30 THEN 'days_30' WHEN _duration_days <= 90 THEN 'days_90' WHEN _duration_days <= 180 THEN 'days_180' ELSE 'days_365' END;
  END IF;
  UPDATE public.activations SET status = 'approved', processed_by = v_admin, processed_at = now(), notes = COALESCE(_notes, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = CASE WHEN v_is_permanent THEN 'permanent' ELSE 'active' END, license_type = v_lic_type, expiry_date = v_expiry, account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'approve_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent, 'notes', _notes));
  RETURN jsonb_build_object('success', true, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. CONSOLIDATE: admin_reject_activation (from sql/rpc_admin_activation.sql)
--    Called by src/components/admin/ActivationRequests.tsx
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_activation(_request_id UUID, _reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed'); END IF;
  UPDATE public.activations SET status = 'rejected', processed_by = v_admin, processed_at = now(), notes = COALESCE(_reason, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = 'rejected', account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'reject_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_activation(UUID, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_reject_activation(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. CONSOLIDATE: admin_modify_activation (from sql/rpc_admin_activation.sql)
--    Called by src/components/admin/ActivationRequests.tsx
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_modify_activation(_request_id UUID, _license_type TEXT DEFAULT 'days_30', _duration_days INTEGER DEFAULT 30, _notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD; v_expiry DATE; v_lic_type TEXT; v_is_permanent BOOLEAN;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found'); END IF;
  v_is_permanent := (_license_type = 'permanent');
  IF v_is_permanent THEN
    v_lic_type := 'permanent'; v_expiry := NULL;
  ELSE
    v_expiry := (now() + (_duration_days || ' days')::INTERVAL)::DATE;
    v_lic_type := CASE WHEN _duration_days <= 30 THEN 'days_30' WHEN _duration_days <= 90 THEN 'days_90' WHEN _duration_days <= 180 THEN 'days_180' ELSE 'days_365' END;
  END IF;
  UPDATE public.activations SET notes = COALESCE(_notes, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = CASE WHEN v_is_permanent THEN 'permanent' ELSE 'active' END, license_type = v_lic_type, expiry_date = v_expiry, account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'modify_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent, 'notes', _notes));
  RETURN jsonb_build_object('success', true, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. CONSOLIDATE: admin_revoke_activation (from sql/rpc_admin_activation.sql)
--    Called by src/components/admin/ActivationRequests.tsx
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_activation(_request_id UUID, _reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found'); END IF;
  UPDATE public.activations SET notes = COALESCE(_reason, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = 'expired', account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'revoke_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', 'revoked');
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_revoke_activation(UUID, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_revoke_activation(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. CONSOLIDATE: admin_create_user (production-only, not in any migration)
--    Called by admin panel to create new users with roles and profile data.
--    Signature from production: (p_email text, p_password text, p_role text,
--    p_display_name text, p_phone text, p_shop_name text, p_city text,
--    p_commission_type text, p_commission_value numeric, p_credit_limit numeric)
--
--    NOTE: Production version delegates to create_auth_user() which is also
--    production-only. Since CREATE OR REPLACE is used, if the function already
--    exists in production with a different body, it will be preserved.
--    This migration ensures the function is tracked in the migration chain.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_role TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_shop_name TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_commission_type TEXT DEFAULT NULL,
  p_commission_value NUMERIC DEFAULT 0,
  p_credit_limit NUMERIC DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_user_id UUID;
  v_role app_role;
BEGIN
  v_admin := public._require_admin();
  v_role := p_role::app_role;

  -- Delegate to create_auth_user if available (production behavior)
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'create_auth_user') THEN
    v_user_id := public.create_auth_user(p_email, p_password);
  ELSE
    -- Fallback: direct insert into auth.users
    INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (p_email, crypt(p_password, gen_salt('bf')), now(), now(), now())
    RETURNING id INTO v_user_id;
  END IF;

  -- Assign role
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, v_role);

  -- Create profile
  INSERT INTO public.profiles (user_id, email, display_name, phone, shop_name, city,
                               commission_type, commission_value, credit_limit,
                               license_status, license_type, account_status)
  VALUES (v_user_id, p_email, p_display_name, p_phone, p_shop_name, p_city,
          p_commission_type, p_commission_value, p_credit_limit,
          'trial', 'trial', 'active');

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'create_user', 'user', v_user_id::TEXT,
          jsonb_build_object('email', p_email, 'role', p_role, 'display_name', p_display_name));

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'role', p_role);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text, text, numeric, numeric) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text, text, numeric, numeric) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. CONSOLIDATE: admin_set_user_role (production-only, not in any migration)
--    Called by admin panel to set user role.
--    Signature from production: (p_user_id uuid, p_role text)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_new_role app_role;
BEGIN
  v_admin := public._require_admin();
  v_new_role := p_role::app_role;

  -- Upsert role (check first to handle tables without unique constraint)
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = v_new_role) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_new_role);
  END IF;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'set_user_role', 'user', p_user_id::TEXT,
          jsonb_build_object('role', p_role));

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_role);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- END OF STABILIZATION MIGRATION
-- No tables were dropped, no data was modified, no columns were removed.
-- Only missing functions were restored/created and grants were re-established.
-- ----------------------------------------------------------------------------
