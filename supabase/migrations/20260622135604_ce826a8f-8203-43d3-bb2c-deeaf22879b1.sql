
-- 1) admin_transfer_license: move a license from one device to another, preserving audit history
CREATE OR REPLACE FUNCTION public.admin_transfer_license(
  _license_id uuid,
  _new_device_id text,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_lic_old public.licenses%ROWTYPE;
  v_lic_new public.licenses%ROWTYPE;
  v_old_device text;
  v_new_dev public.devices%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF _new_device_id IS NULL OR length(_new_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_lic_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  v_old_device := v_lic_old.device_id;

  -- Ensure new device exists in the system (auto-register if missing)
  INSERT INTO public.devices (device_id, lifecycle_state, first_seen_at, last_seen, last_seen_at)
  VALUES (_new_device_id, 'pending_activation', now(), now(), now())
  ON CONFLICT (device_id) DO UPDATE
    SET lifecycle_state = COALESCE(public.devices.lifecycle_state, 'pending_activation'),
        updated_at = now()
  RETURNING * INTO v_new_dev;

  IF v_new_dev.is_blocked OR v_new_dev.is_banned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'target_device_blocked');
  END IF;

  -- Move the binding
  UPDATE public.licenses
     SET device_id = _new_device_id,
         device_fingerprint = NULL,
         status = 'active'::license_status,
         activated_at = COALESCE(activated_at, now()),
         updated_at = now()
   WHERE id = _license_id
   RETURNING * INTO v_lic_new;

  -- Update new device lifecycle
  UPDATE public.devices
     SET lifecycle_state = 'active', updated_at = now()
   WHERE device_id = _new_device_id;

  -- Revert old device lifecycle if it had this license
  IF v_old_device IS NOT NULL AND v_old_device <> _new_device_id THEN
    UPDATE public.devices
       SET lifecycle_state = CASE
             WHEN is_blocked OR is_banned THEN 'blocked'
             ELSE 'revoked'
           END,
           updated_at = now()
     WHERE device_id = v_old_device;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values, metadata)
  VALUES (v_uid, v_lic_new.user_id, _new_device_id, 'admin_transfer_license', 'licenses', v_lic_new.id::text,
          to_jsonb(v_lic_old), to_jsonb(v_lic_new),
          jsonb_build_object('from_device', v_old_device, 'to_device', _new_device_id, 'reason', _reason));

  RETURN jsonb_build_object('ok', true, 'license', to_jsonb(v_lic_new),
                            'from_device', v_old_device, 'to_device', _new_device_id);
END;
$$;

-- 2) Backfill lifecycle_state on existing devices (non-destructive)
UPDATE public.devices SET lifecycle_state = 'blocked'
 WHERE lifecycle_state IS NULL AND (is_blocked OR is_banned);

UPDATE public.devices d SET lifecycle_state = 'active'
 WHERE d.lifecycle_state IS NULL
   AND EXISTS (SELECT 1 FROM public.licenses l
                WHERE l.device_id = d.device_id
                  AND l.status::text = 'active');

UPDATE public.devices d SET lifecycle_state = 'trial'
 WHERE d.lifecycle_state IS NULL
   AND EXISTS (SELECT 1 FROM public.trials t
                WHERE t.device_id = d.device_id
                  AND t.status = 'active'
                  AND t.expires_at > now());

UPDATE public.devices SET lifecycle_state = 'pending_activation'
 WHERE lifecycle_state IS NULL;

-- 3) Improve device_heartbeat to keep lifecycle_state in sync (drop & recreate with state writeback)
CREATE OR REPLACE FUNCTION public.device_heartbeat(
  _device_id text,
  _fingerprint text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _platform text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dev public.devices%ROWTYPE;
  v_lic public.licenses%ROWTYPE;
  v_trial public.trials%ROWTYPE;
  v_min_ver text;
  v_force boolean;
  v_maint boolean;
  v_state text;
  v_reason text;
  v_lifecycle text;
BEGIN
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  INSERT INTO public.devices (device_id, user_id, device_fingerprint, app_version, platform,
                              lifecycle_state, last_seen, last_seen_at, last_sync_at,
                              last_activity_at, first_seen_at)
  VALUES (_device_id, v_uid, _fingerprint, _app_version, _platform,
          'trial', now(), now(), now(), now(), now())
  ON CONFLICT (device_id) DO UPDATE SET
    user_id            = COALESCE(public.devices.user_id, EXCLUDED.user_id),
    device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, public.devices.device_fingerprint),
    app_version        = COALESCE(EXCLUDED.app_version, public.devices.app_version),
    platform           = COALESCE(EXCLUDED.platform, public.devices.platform),
    last_seen          = now(),
    last_seen_at       = now(),
    last_sync_at       = now(),
    last_activity_at   = now(),
    updated_at         = now()
  RETURNING * INTO v_dev;

  -- Auto-create a trial row on first heartbeat (idempotent)
  INSERT INTO public.trials (device_id, started_at, expires_at, days_total, status)
  VALUES (_device_id, now(), now() + interval '30 days', 30, 'active')
  ON CONFLICT (device_id) DO NOTHING;

  SELECT (value #>> '{}')::text INTO v_min_ver FROM public.system_config WHERE key='minimum_supported_version';
  SELECT (value)::boolean       INTO v_force   FROM public.system_config WHERE key='force_update_enabled';
  SELECT (value)::boolean       INTO v_maint   FROM public.system_config WHERE key='maintenance_mode';

  SELECT * INTO v_lic FROM public.licenses
   WHERE device_id = _device_id
     AND status::text IN ('active','suspended')
   ORDER BY updated_at DESC LIMIT 1;

  SELECT * INTO v_trial FROM public.trials WHERE device_id = _device_id;

  IF COALESCE(v_maint,false) THEN
    v_state := 'maintenance'; v_reason := 'maintenance_mode'; v_lifecycle := v_dev.lifecycle_state;
  ELSIF v_dev.is_blocked OR v_dev.is_banned THEN
    v_state := 'blocked'; v_reason := COALESCE(v_dev.block_reason, v_dev.ban_reason, 'blocked'); v_lifecycle := 'blocked';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'suspended' THEN
    v_state := 'suspended'; v_reason := 'license_suspended'; v_lifecycle := 'suspended';
  ELSIF v_lic.id IS NOT NULL
        AND v_lic.status::text = 'active'
        AND (COALESCE(v_lic.permanent,false) OR v_lic.expiry_date IS NULL OR v_lic.expiry_date >= CURRENT_DATE) THEN
    v_state := 'license_active'; v_reason := 'ok'; v_lifecycle := 'active';
  ELSIF v_lic.id IS NOT NULL
        AND NOT COALESCE(v_lic.permanent,false)
        AND v_lic.expiry_date IS NOT NULL
        AND v_lic.expiry_date < CURRENT_DATE THEN
    v_state := 'license_expired'; v_reason := 'license_expired'; v_lifecycle := 'revoked';
  ELSIF v_trial.id IS NOT NULL
        AND v_trial.status = 'active'
        AND v_trial.expires_at > now() THEN
    v_state := 'trial_active'; v_reason := 'ok'; v_lifecycle := 'trial';
  ELSIF v_trial.id IS NOT NULL
        AND (v_trial.status <> 'active' OR v_trial.expires_at <= now()) THEN
    v_state := 'trial_expired'; v_reason := 'trial_expired'; v_lifecycle := 'pending_activation';
  ELSE
    v_state := 'not_registered'; v_reason := 'no_trial_no_license'; v_lifecycle := 'pending_activation';
  END IF;

  IF v_dev.lifecycle_state IS DISTINCT FROM v_lifecycle THEN
    UPDATE public.devices SET lifecycle_state = v_lifecycle, updated_at = now()
     WHERE device_id = _device_id RETURNING * INTO v_dev;
  END IF;

  IF COALESCE(v_force,false) AND v_min_ver IS NOT NULL AND _app_version IS NOT NULL
     AND _app_version < v_min_ver
     AND v_state IN ('license_active','trial_active') THEN
    v_state := 'force_update'; v_reason := 'app_version_too_old';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'reason', v_reason,
    'lifecycle_state', v_lifecycle,
    'device', to_jsonb(v_dev),
    'license', CASE WHEN v_lic.id IS NOT NULL THEN to_jsonb(v_lic) END,
    'trial',   CASE WHEN v_trial.id IS NOT NULL THEN to_jsonb(v_trial) END,
    'force_update', jsonb_build_object(
       'enabled', COALESCE(v_force,false),
       'minimum_version', v_min_ver,
       'maintenance', COALESCE(v_maint,false)
    )
  );
END;
$$;
