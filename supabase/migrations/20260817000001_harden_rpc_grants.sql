-- ============================================================================
-- F6/F8: remove the legacy, uncalled license RPCs from the anon/authenticated
-- surface and tighten sloppy grants.
--
-- F6: validate_license / activate_license / device_heartbeat were granted
--     EXECUTE to anon + authenticated, are SECURITY DEFINER, and have NO caller
--     anywhere in the current frontend. device_heartbeat also creates 30-day
--     trials + device rows (trial-abuse vector, SB5).
-- F8: admin_set_role / admin_search_notification_users were granted to anon.
--     Their bodies already enforce admin, but anon must not even reach them.
-- ============================================================================

-- F6: keep them callable ONLY by service_role (for any legacy/report tooling).
REVOKE EXECUTE ON FUNCTION public.validate_license(text, text, text) FROM PUBLIC, ANON, AUTHENTICATED;
REVOKE EXECUTE ON FUNCTION public.activate_license(text, text, text) FROM PUBLIC, ANON, AUTHENTICATED;
REVOKE EXECUTE ON FUNCTION public.device_heartbeat(text, text, text, text) FROM PUBLIC, ANON, AUTHENTICATED;

GRANT EXECUTE ON FUNCTION public.validate_license(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.device_heartbeat(text, text, text, text) TO service_role;

-- F8: anon must not reach admin RPCs (internal admin checks stay as defense).
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) FROM PUBLIC, ANON;
REVOKE EXECUTE ON FUNCTION public.admin_search_notification_users(text, integer, integer) FROM PUBLIC, ANON;

GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_notification_users(text, integer, integer) TO authenticated;

-- Helper used only by the notifications code path; keep it out of anon's reach.
REVOKE EXECUTE ON FUNCTION public._resolve_notification_audience(jsonb) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public._resolve_notification_audience(jsonb) TO service_role;
