-- =============================================================================
-- 04_device_takeover_auth.sql
-- Device takeover: revoke the displaced device's real Supabase auth session
-- when a force login takes over, so it is actually signed out.
--
-- Apply order: 00 → 01 → 02 → 03 → 04.
--
-- device_auth links a device to the refresh token of the Supabase auth
-- session that device is using. On force takeover the device-login edge
-- function redeems the displaced device's refresh token (GoTrue rotates and
-- invalidates it), killing the old device's session so it cannot refresh.
--
-- The table is deliberately service_role-only: no RLS policies are created,
-- so authenticated users cannot read or write it (service_role bypasses RLS).
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.device_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  refresh_token text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE public.device_auth ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_device_auth_user ON public.device_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_device_auth_device ON public.device_auth(device_id);

GRANT ALL ON public.device_auth TO service_role;

COMMIT;
