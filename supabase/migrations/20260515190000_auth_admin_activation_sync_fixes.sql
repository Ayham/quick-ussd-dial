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
