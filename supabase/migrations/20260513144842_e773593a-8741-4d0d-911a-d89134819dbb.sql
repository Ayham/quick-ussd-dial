
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
