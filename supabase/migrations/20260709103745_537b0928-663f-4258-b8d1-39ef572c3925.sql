
-- Revoke EXECUTE from authenticated/PUBLIC on all SECURITY DEFINER functions in public.
-- Admin RPCs are now routed via the admin-rpc edge function using the service role after
-- verifying the caller is an admin. Non-admin RPCs (device_heartbeat, activate_license,
-- validate_license) are only invoked from edge functions using the service role.

REVOKE EXECUTE ON FUNCTION public.activate_license(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_license(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.device_heartbeat(text, text, text, text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_extend_license(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_convert_license(uuid, boolean, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_end_trial(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_convert_trial(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_decide_activation(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_device(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_license_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_block_device(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_transfer_license(uuid, text, text) FROM PUBLIC, anon, authenticated;
