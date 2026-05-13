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
