
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
