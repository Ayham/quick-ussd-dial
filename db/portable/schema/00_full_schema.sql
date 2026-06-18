
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ DEVICES ============
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT,
  model TEXT,
  platform TEXT,
  app_version TEXT,
  language TEXT,
  timezone TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON public.devices(user_id);
CREATE INDEX idx_devices_last_seen ON public.devices(last_seen DESC);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own device" ON public.devices FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage devices" ON public.devices FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER devices_updated BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LICENSES ============
CREATE TYPE public.license_status AS ENUM ('active', 'expired', 'revoked', 'pending');

CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL UNIQUE,
  device_id TEXT REFERENCES public.devices(device_id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status license_status NOT NULL DEFAULT 'pending',
  level TEXT NOT NULL DEFAULT 'standard',
  expiry_date DATE,
  permanent BOOLEAN NOT NULL DEFAULT false,
  ussd_numbers TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_licenses_device ON public.licenses(device_id);
CREATE INDEX idx_licenses_user ON public.licenses(user_id);
CREATE INDEX idx_licenses_status ON public.licenses(status);
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own license" ON public.licenses FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage licenses" ON public.licenses FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER licenses_updated BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ACTIVATIONS (request flow from trial expired) ============
CREATE TYPE public.activation_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_token TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_phone TEXT,
  contact_name TEXT,
  ussd_numbers TEXT[] NOT NULL DEFAULT '{}',
  status activation_status NOT NULL DEFAULT 'pending',
  license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_activations_status ON public.activations(status);
CREATE INDEX idx_activations_device ON public.activations(device_id);
ALTER TABLE public.activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own activation" ON public.activations FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage activations" ON public.activations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ TRIALS ============
CREATE TABLE public.trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  days_total INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'active',
  extended_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage trials" ON public.trials FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trials_updated BEFORE UPDATE ON public.trials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRANSFERS ============
CREATE TABLE public.transfers (
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
CREATE INDEX idx_transfers_device ON public.transfers(device_id, created_at DESC);
CREATE INDEX idx_transfers_user ON public.transfers(user_id);
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transfers" ON public.transfers FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage transfers" ON public.transfers FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ USSD CODES ============
CREATE TABLE public.ussd_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operator TEXT NOT NULL,
  label TEXT NOT NULL,
  template TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ussd_device ON public.ussd_codes(device_id);
ALTER TABLE public.ussd_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ussd" ON public.ussd_codes FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ussd" ON public.ussd_codes FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ussd_updated BEFORE UPDATE ON public.ussd_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER SETTINGS ============
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, key)
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage settings" ON public.user_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DISTRIBUTORS ============
CREATE TABLE public.distributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_id)
);
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own distributors" ON public.distributors FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage distributors" ON public.distributors FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER distributors_updated BEFORE UPDATE ON public.distributors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.distributor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  distributor_id UUID NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_id)
);
ALTER TABLE public.distributor_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dist tx" ON public.distributor_transactions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own dist tx" ON public.distributor_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = distributor_id AND (d.user_id = auth.uid()))
);

-- ============ ADMIN ACTIONS AUDIT LOG ============
CREATE TABLE public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_label TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit" ON public.admin_actions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write audit" ON public.admin_actions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SYNC LOGS ============
CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_logs_device ON public.sync_logs(device_id, created_at DESC);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view sync logs" ON public.sync_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ APP EVENTS (analytics) ============
CREATE TABLE public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_device ON public.app_events(device_id, created_at DESC);
CREATE INDEX idx_events_event ON public.app_events(event);
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view events" ON public.app_events FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- ============ SYNC LOGS ============
CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'synced',
  records_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_logs_device ON public.sync_logs(device_id, created_at DESC);
CREATE INDEX idx_sync_logs_status ON public.sync_logs(status);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sync logs" ON public.sync_logs FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage sync logs" ON public.sync_logs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ ERROR LOGS ============
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_error_logs_device ON public.error_logs(device_id, created_at DESC);
CREATE INDEX idx_error_logs_type ON public.error_logs(error_type);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view error logs" ON public.error_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage error logs" ON public.error_logs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ APP USAGE ============
CREATE TABLE public.app_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ,
  transfers_count INTEGER NOT NULL DEFAULT 0,
  balance_checks_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_usage_device ON public.app_usage(device_id, session_start DESC);
CREATE INDEX idx_app_usage_user ON public.app_usage(user_id);
ALTER TABLE public.app_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON public.app_usage FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage usage" ON public.app_usage FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ ADD LANGUAGE COLUMN TO PROFILES ============
-- (Already exists, just documented for reference)

-- ============ PERMISSIONS ============
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
-- Production hardening for auth-protected app, admin panels, activation polling, and sync logs.

-- Keep sync_logs compatible with the current Edge Function and admin UI, even if an
-- older migration created the first version of the table.
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS records_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS event TEXT;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::JSONB;

UPDATE public.sync_logs
SET
  event_type = COALESCE(event_type, event),
  error_message = COALESCE(error_message, error),
  records_count = CASE
    WHEN records_count IS NULL OR records_count = 0 THEN
      COALESCE(jsonb_array_length(payload->'events'), 0)
    ELSE records_count
  END
WHERE event_type IS NULL
   OR error_message IS NULL
   OR records_count IS NULL;

ALTER TABLE public.sync_logs ALTER COLUMN event_type SET DEFAULT 'sync';
UPDATE public.sync_logs SET event_type = 'sync' WHERE event_type IS NULL;
ALTER TABLE public.sync_logs ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own sync logs" ON public.sync_logs;
DROP POLICY IF EXISTS "Admins manage sync logs" ON public.sync_logs;
DROP POLICY IF EXISTS "Admins view sync logs" ON public.sync_logs;
CREATE POLICY "Users view own sync logs" ON public.sync_logs
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage sync logs" ON public.sync_logs
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_sync_logs_device ON public.sync_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON public.sync_logs(status);

-- Let authenticated users see activation rows created for their account while
-- admins retain full control.
DROP POLICY IF EXISTS "Users view own activation" ON public.activations;
CREATE POLICY "Users view own activation" ON public.activations
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Ensure profile language defaults to Arabic and remains constrained.
ALTER TABLE public.profiles ALTER COLUMN language SET DEFAULT 'ar';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_language_check CHECK (language IN ('ar', 'en'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles(user_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS devices_device_id_key ON public.devices(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS transfers_device_client_id_key ON public.transfers(device_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activations_request_token_key ON public.activations(request_token);
CREATE UNIQUE INDEX IF NOT EXISTS licenses_license_key_key ON public.licenses(license_key);
-- 1. app_events: allow users to insert their own events
CREATE POLICY "Users insert own events" ON public.app_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. devices: owner-scoped insert/update
CREATE POLICY "Users insert own device" ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own device" ON public.devices
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. trials: allow users to read trials for devices they own
CREATE POLICY "Users view own trial" ON public.trials
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.device_id = trials.device_id AND d.user_id = auth.uid()
  ));

-- 4. user_settings: owner-scoped insert/update
CREATE POLICY "Users insert own settings" ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own settings" ON public.user_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. ussd_codes: owner-scoped insert/update/delete
CREATE POLICY "Users insert own ussd" ON public.ussd_codes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ussd" ON public.ussd_codes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ussd" ON public.ussd_codes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6. user_roles: prevent admin self/peer escalation through the Data API.
-- Replace the broad "Admins manage roles" policy with one that forbids
-- writing the 'admin' role from client-side requests. Admin promotion must
-- go through the admin-bootstrap edge function (service role).
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

CREATE POLICY "Admins manage non-admin roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'admin'::app_role)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'admin'::app_role);
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
-- =========================================================================
-- BATCH 1: FOUNDATION SCHEMA
-- =========================================================================

-- ---- Extend devices table ------------------------------------------------
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS android_id TEXT,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS app_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS last_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON public.devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_android_id ON public.devices(android_id);

-- =========================================================================
-- contacts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT,
  client_id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  operator TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_normalized),
  UNIQUE (device_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_owner_all" ON public.contacts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts_admin_all" ON public.contacts FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_contacts_user ON public.contacts(user_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone_normalized);

-- =========================================================================
-- amount_presets
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.amount_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL DEFAULT gen_random_uuid(),
  operator TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  price NUMERIC,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amount_presets TO authenticated;
GRANT ALL ON public.amount_presets TO service_role;
ALTER TABLE public.amount_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amount_presets_owner_all" ON public.amount_presets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "amount_presets_admin_all" ON public.amount_presets FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_amount_presets_user_op ON public.amount_presets(user_id, operator);

-- =========================================================================
-- sim_assignments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sim_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  operator TEXT NOT NULL,
  msisdn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, slot)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_assignments TO authenticated;
GRANT ALL ON public.sim_assignments TO service_role;
ALTER TABLE public.sim_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_assignments_owner_all" ON public.sim_assignments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sim_assignments_admin_all" ON public.sim_assignments FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- subscription_plans (catalog)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  duration_days INTEGER NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SYP',
  max_devices INTEGER NOT NULL DEFAULT 1,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_plans_read_all" ON public.subscription_plans FOR SELECT
  USING (true);
CREATE POLICY "subscription_plans_admin_write" ON public.subscription_plans FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- payments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  device_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SYP',
  method TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_owner_select" ON public.payments FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "payments_owner_insert" ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments_admin_update" ON public.payments FOR UPDATE
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "payments_admin_delete" ON public.payments FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_payments_user ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);

-- =========================================================================
-- daily_summaries
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT,
  day DATE NOT NULL,
  operator TEXT,
  transfers_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  amount_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id, day, operator)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_summaries TO authenticated;
GRANT ALL ON public.daily_summaries TO service_role;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_summaries_owner_all" ON public.daily_summaries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_summaries_admin_all" ON public.daily_summaries FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_daily_summaries_user_day ON public.daily_summaries(user_id, day);

-- =========================================================================
-- audit_logs
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  target_user_id UUID,
  device_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR auth.uid() = target_user_id);
CREATE POLICY "audit_logs_insert_any_auth" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- =========================================================================
-- app_settings (per-user key/value)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_owner_all" ON public.app_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "app_settings_admin_all" ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- system_config (global)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_config TO authenticated, anon;
GRANT ALL ON public.system_config TO service_role;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_config_read_all" ON public.system_config FOR SELECT USING (true);
CREATE POLICY "system_config_admin_write" ON public.system_config FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- notifications
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  is_admin_target BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_owner_select" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id OR (is_admin_target AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "notifications_owner_update" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id OR (is_admin_target AND public.has_role(auth.uid(),'admin')))
  WITH CHECK (auth.uid() = user_id OR (is_admin_target AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "notifications_admin_all" ON public.notifications FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at);

-- =========================================================================
-- sync_conflicts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  device_id TEXT,
  entity TEXT NOT NULL,
  client_id UUID,
  conflict_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  payload JSONB,
  error TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sync_conflicts TO authenticated;
GRANT ALL ON public.sync_conflicts TO service_role;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_conflicts_owner_select" ON public.sync_conflicts FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sync_conflicts_insert_self" ON public.sync_conflicts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);
CREATE POLICY "sync_conflicts_admin_all" ON public.sync_conflicts FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- sync_metrics
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sync_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  device_id TEXT,
  duration_ms INTEGER,
  records_sent INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sync_metrics TO authenticated;
GRANT ALL ON public.sync_metrics TO service_role;
ALTER TABLE public.sync_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_metrics_owner_select" ON public.sync_metrics FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sync_metrics_insert_self" ON public.sync_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);
CREATE INDEX idx_sync_metrics_user_time ON public.sync_metrics(user_id, created_at DESC);

-- =========================================================================
-- failed_logins
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.failed_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.failed_logins TO anon, authenticated;
GRANT ALL ON public.failed_logins TO service_role;
ALTER TABLE public.failed_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "failed_logins_admin_select" ON public.failed_logins FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "failed_logins_anyone_insert" ON public.failed_logins FOR INSERT WITH CHECK (true);
CREATE INDEX idx_failed_logins_email_time ON public.failed_logins(email, created_at DESC);
CREATE INDEX idx_failed_logins_ip_time ON public.failed_logins(ip, created_at DESC);

-- =========================================================================
-- account_lockouts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  locked_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_lockouts TO anon, authenticated;
GRANT ALL ON public.account_lockouts TO service_role;
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_lockouts_admin_all" ON public.account_lockouts FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "account_lockouts_public_select" ON public.account_lockouts FOR SELECT USING (true);

-- =========================================================================
-- device_bans
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.device_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID,
  reason TEXT,
  banned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ
);
GRANT SELECT ON public.device_bans TO authenticated;
GRANT ALL ON public.device_bans TO service_role;
ALTER TABLE public.device_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_bans_admin_all" ON public.device_bans FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "device_bans_owner_select" ON public.device_bans FOR SELECT
  USING (auth.uid() = user_id);
CREATE INDEX idx_device_bans_device ON public.device_bans(device_id);

-- =========================================================================
-- sessions
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT,
  ip TEXT,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_owner_all" ON public.sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_admin_all" ON public.sessions FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_sessions_user ON public.sessions(user_id);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'contacts','amount_presets','sim_assignments','subscription_plans',
    'payments','daily_summaries','app_settings','system_config',
    'account_lockouts'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- =========================================================================
-- SEED: subscription plans + system_config defaults
-- =========================================================================
INSERT INTO public.subscription_plans (code, name, description, duration_days, price, max_devices, features, display_order) VALUES
  ('trial',     'Trial',     '14-day free trial',         14,      0, 1, '["basic_transfers","contacts"]'::jsonb, 1),
  ('monthly',   'Monthly',   '1 month subscription',      30,  50000, 2, '["basic_transfers","contacts","reports"]'::jsonb, 2),
  ('quarterly', 'Quarterly', '3 month subscription',      90, 135000, 3, '["basic_transfers","contacts","reports","advanced_reports"]'::jsonb, 3),
  ('yearly',    'Yearly',    '1 year subscription',      365, 480000, 5, '["basic_transfers","contacts","reports","advanced_reports","priority_support"]'::jsonb, 4),
  ('lifetime',  'Lifetime',  'Lifetime license',       36500,1500000,10, '["basic_transfers","contacts","reports","advanced_reports","priority_support","all"]'::jsonb, 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.system_config (key, value, description) VALUES
  ('trial_days',         '14'::jsonb,                              'Default trial duration in days'),
  ('maintenance_mode',   'false'::jsonb,                           'App-wide maintenance flag'),
  ('min_app_version',    '"1.0.0"'::jsonb,                         'Minimum supported app version'),
  ('sync_interval_sec',  '60'::jsonb,                              'Default sync interval (seconds)'),
  ('sheets_export_url',  '""'::jsonb,                              'Google Sheets export URL (admin)'),
  ('feature_flags',      '{}'::jsonb,                              'Feature flag map'),
  ('login_max_attempts', '5'::jsonb,                               'Failed login attempts before lockout'),
  ('lockout_minutes',    '15'::jsonb,                              'Lockout duration in minutes')
ON CONFLICT (key) DO NOTHING;

-- Tighten failed_logins insert: require at least one identifying field
DROP POLICY IF EXISTS "failed_logins_anyone_insert" ON public.failed_logins;
CREATE POLICY "failed_logins_identified_insert" ON public.failed_logins FOR INSERT
  WITH CHECK (email IS NOT NULL OR ip IS NOT NULL);

-- ---- Device limit enforcement -------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only check on INSERT or when transitioning to active
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_active,false) = COALESCE(NEW.is_active,false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_active, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(sp.max_devices), 1) INTO v_limit
    FROM public.licenses l
    JOIN public.subscription_plans sp
      ON sp.code = l.plan OR sp.id::text = l.plan
   WHERE l.user_id = NEW.user_id
     AND l.status = 'active'
     AND (l.expires_at IS NULL OR l.expires_at > now());

  IF v_limit IS NULL THEN v_limit := 1; END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.devices d
   WHERE d.user_id = NEW.user_id
     AND d.is_active = true
     AND d.id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'device_limit_exceeded: plan allows % active device(s)', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_device_limit ON public.devices;
CREATE TRIGGER trg_enforce_device_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_device_limit();

-- ---- Anti-cloning detection ---------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_device_cloning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_user UUID;
BEGIN
  IF NEW.device_fingerprint IS NOT NULL THEN
    SELECT user_id INTO v_other_user
      FROM public.devices
     WHERE device_fingerprint = NEW.device_fingerprint
       AND user_id <> NEW.user_id
     LIMIT 1;
    IF v_other_user IS NOT NULL THEN
      INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id, metadata)
      VALUES (NEW.user_id, NEW.user_id, NEW.device_id, 'device_clone_suspected', 'devices', NEW.id::text,
              jsonb_build_object('fingerprint', NEW.device_fingerprint, 'other_user', v_other_user));
      INSERT INTO public.notifications(user_id, is_admin_target, type, title, body, metadata)
      VALUES (NULL, true, 'security', 'Suspected device clone',
              'A device fingerprint is registered to multiple users.',
              jsonb_build_object('device_id', NEW.device_id, 'user_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_device_cloning ON public.devices;
CREATE TRIGGER trg_detect_device_cloning
  AFTER INSERT OR UPDATE OF device_fingerprint, android_id ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.detect_device_cloning();

REVOKE EXECUTE ON FUNCTION public.enforce_device_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_device_cloning() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_device_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_device_cloning() TO service_role;
