-- =============================================================================
-- Admin visibility for app_settings (USSD credentials)
--
-- The only prior policy (app_settings_owner_all) allowed the row OWNER only,
-- so any admin-side direct SELECT on app_settings silently returned zero rows
-- for other users. The admin Users page now reads credentials through
-- admin_get_users_admin (SECURITY DEFINER), but this policy keeps direct
-- admin queries working as defense-in-depth.
--
-- Idempotent: safe to re-run on any environment.
-- =============================================================================

DROP POLICY IF EXISTS "Admins view app_settings" ON public.app_settings;

CREATE POLICY "Admins view app_settings" ON public.app_settings
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
