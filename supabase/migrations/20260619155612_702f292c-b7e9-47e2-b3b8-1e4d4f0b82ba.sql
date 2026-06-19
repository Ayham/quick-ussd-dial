
-- Device-bound license enforcement
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS device_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_one_active_per_device
  ON public.licenses(device_id)
  WHERE status = 'active' AND device_id IS NOT NULL;

-- Activate a license to a specific device (idempotent for same device, rejects different device)
CREATE OR REPLACE FUNCTION public.activate_license(
  _license_key text,
  _device_id   text,
  _fingerprint text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lic public.licenses%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF _license_key IS NULL OR length(_license_key) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_lic FROM public.licenses
    WHERE license_key = _license_key
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_lic.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF NOT COALESCE(v_lic.permanent, false) AND v_lic.expiry_date IS NOT NULL AND v_lic.expiry_date < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- Bound to a different device already
  IF v_lic.device_id IS NOT NULL AND v_lic.device_id <> _device_id THEN
    INSERT INTO public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
    VALUES (v_uid, 'license_device_mismatch', 'licenses', v_lic.id::text,
            jsonb_build_object('attempted_device', _device_id, 'bound_device', v_lic.device_id));
    RETURN jsonb_build_object('ok', false, 'reason', 'device_mismatch');
  END IF;

  UPDATE public.licenses
     SET device_id = _device_id,
         device_fingerprint = COALESCE(_fingerprint, device_fingerprint),
         status = 'active',
         activated_at = COALESCE(activated_at, now()),
         user_id = COALESCE(user_id, v_uid)
   WHERE id = v_lic.id
   RETURNING * INTO v_lic;

  INSERT INTO public.audit_logs(actor_user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'license_activated', 'licenses', v_lic.id::text,
          jsonb_build_object('device_id', _device_id));

  RETURN jsonb_build_object('ok', true, 'license', to_jsonb(v_lic));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_license(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text, text) TO authenticated, anon, service_role;

-- Admin grants/revokes a role on another user
CREATE OR REPLACE FUNCTION public.admin_set_role(
  _target_user uuid,
  _role public.app_role,
  _grant boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF _target_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target');
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_target_user, _role)
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Prevent removing the last admin
    IF _role = 'admin' THEN
      IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'last_admin');
      END IF;
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _target_user AND role = _role;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, action, entity, entity_id, metadata)
  VALUES (v_actor, _target_user, CASE WHEN _grant THEN 'role_grant' ELSE 'role_revoke' END,
          'user_roles', _target_user::text, jsonb_build_object('role', _role));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated, service_role;
