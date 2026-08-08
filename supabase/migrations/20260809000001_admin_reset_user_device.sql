-- ============================================================================
-- RPC: admin_reset_user_device
-- Clears profiles.current_device so the account re-binds to the next device
-- that logs in. Also revokes the account's app sessions.
-- Resolves "هذا الحساب مسجل على جهاز آخر / This account is registered on
-- another device" (device_mismatch) for accounts stuck on an old device.
-- Admin only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_device(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_prof public.profiles%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  UPDATE public.profiles
     SET current_device = NULL,
         updated_at = now()
   WHERE user_id = _user_id;

  UPDATE public.sessions
     SET revoked_at = now()
   WHERE user_id = _user_id
     AND revoked_at IS NULL;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values, metadata)
  VALUES (v_uid, _user_id, v_prof.current_device, 'admin_reset_user_device', 'profiles', _user_id::text,
          jsonb_build_object('current_device', v_prof.current_device),
          jsonb_build_object('current_device', NULL),
          jsonb_build_object('reason', 'device_binding_reset'));

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'previous_device', v_prof.current_device);
END; $$;

REVOKE ALL ON FUNCTION public.admin_reset_user_device(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_device(uuid) TO authenticated, service_role;
