-- Server-authoritative license validation for device-bound access.
CREATE OR REPLACE FUNCTION public.validate_license(
  _license_key text,
  _device_id text,
  _fingerprint text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lic public.licenses%ROWTYPE;
  v_dev public.devices%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_dev
  FROM public.devices
  WHERE device_id = _device_id;

  IF FOUND AND (COALESCE(v_dev.is_blocked, false) OR COALESCE(v_dev.is_banned, false) OR NOT COALESCE(v_dev.is_active, true)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_blocked');
  END IF;

  SELECT * INTO v_lic
  FROM public.licenses
  WHERE license_key = _license_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_lic.device_id IS NULL OR v_lic.device_id <> _device_id THEN
    INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id, metadata)
    VALUES (
      v_uid,
      v_lic.user_id,
      _device_id,
      'license_device_mismatch',
      'licenses',
      v_lic.id::text,
      jsonb_build_object('attempted_device', _device_id, 'bound_device', v_lic.device_id, 'fingerprint', _fingerprint)
    );
    RETURN jsonb_build_object('ok', false, 'reason', 'device_mismatch');
  END IF;

  IF v_lic.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  ELSIF v_lic.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'suspended');
  ELSIF v_lic.status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  ELSIF v_lic.status = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  ELSIF v_lic.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_active');
  END IF;

  IF NOT COALESCE(v_lic.permanent, false) AND (v_lic.expiry_date IS NULL OR v_lic.expiry_date < now()) THEN
    UPDATE public.licenses SET status = 'expired' WHERE id = v_lic.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  RETURN jsonb_build_object('ok', true, 'license', to_jsonb(v_lic));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_license(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_license(text, text, text) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.activate_license(
  _license_key text,
  _device_id text,
  _fingerprint text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lic public.licenses%ROWTYPE;
  v_check jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF _license_key IS NULL OR length(_license_key) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_lic
  FROM public.licenses
  WHERE license_key = _license_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_lic.device_id IS NOT NULL THEN
    RETURN public.validate_license(_license_key, _device_id, _fingerprint);
  END IF;

  IF v_lic.status IN ('revoked', 'suspended', 'inactive', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_lic.status::text);
  END IF;

  IF NOT COALESCE(v_lic.permanent, false) AND (v_lic.expiry_date IS NULL OR v_lic.expiry_date < now()) THEN
    UPDATE public.licenses SET status = 'expired' WHERE id = v_lic.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  UPDATE public.licenses
     SET device_id = _device_id,
         device_fingerprint = COALESCE(_fingerprint, device_fingerprint),
         status = 'active',
         activated_at = COALESCE(activated_at, now()),
         user_id = COALESCE(user_id, v_uid)
   WHERE id = v_lic.id
   RETURNING * INTO v_lic;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    v_lic.user_id,
    _device_id,
    'license_activated',
    'licenses',
    v_lic.id::text,
    jsonb_build_object('device_id', _device_id, 'fingerprint', _fingerprint)
  );

  v_check := public.validate_license(_license_key, _device_id, _fingerprint);
  RETURN v_check;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_license(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text, text) TO authenticated, anon, service_role;
