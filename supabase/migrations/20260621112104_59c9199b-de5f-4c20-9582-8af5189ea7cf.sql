
-- ============================================================
-- Batch 1: Licensing / Activation / Device / Admin hardening
-- Backward-compatible: only ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, INSERT ON CONFLICT. No drops, no data loss.
-- ============================================================

-- 1. Add 'suspended' to license_status enum (idempotent)
ALTER TYPE public.license_status ADD VALUE IF NOT EXISTS 'suspended';

-- 2. devices: add lifecycle + monitoring columns
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS lifecycle_state text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS block_reason text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now();

-- 3. trials: add admin / conversion columns
ALTER TABLE public.trials
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS extended_by_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_license_id uuid;

-- 4. audit_logs: add structured old/new value columns
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

-- 5. system_config seed rows for force-update / maintenance (idempotent)
INSERT INTO public.system_config (key, value, description)
VALUES
  ('minimum_supported_version', '"0.0.0"'::jsonb, 'Devices below this app version are blocked'),
  ('latest_version',            '"0.0.0"'::jsonb, 'Latest published app version'),
  ('force_update_enabled',      'false'::jsonb,   'When true, devices below minimum must update'),
  ('maintenance_mode',          'false'::jsonb,   'When true, all non-admin devices are blocked')
ON CONFLICT (key) DO NOTHING;

-- 6. Scalability indexes (all IF NOT EXISTS, all additive)
CREATE INDEX IF NOT EXISTS idx_licenses_user_status         ON public.licenses (user_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry              ON public.licenses (expiry_date) WHERE permanent = false;
CREATE INDEX IF NOT EXISTS idx_licenses_created             ON public.licenses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licenses_updated             ON public.licenses (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_is_blocked           ON public.devices (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_devices_lifecycle            ON public.devices (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_devices_last_sync            ON public.devices (last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_activity        ON public.devices (last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_trials_user                  ON public.trials (user_id);
CREATE INDEX IF NOT EXISTS idx_trials_status                ON public.trials (status);
CREATE INDEX IF NOT EXISTS idx_trials_expires_at            ON public.trials (expires_at);

CREATE INDEX IF NOT EXISTS idx_activations_user             ON public.activations (user_id);
CREATE INDEX IF NOT EXISTS idx_activations_license          ON public.activations (license_id);
CREATE INDEX IF NOT EXISTS idx_activations_created          ON public.activations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_device_created    ON public.audit_logs (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity            ON public.audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created    ON public.audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transfers_created            ON public.transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_user_created       ON public.transfers (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_created       ON public.sync_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_bans_device           ON public.device_bans (device_id);
CREATE INDEX IF NOT EXISTS idx_device_bans_active           ON public.device_bans (device_id) WHERE lifted_at IS NULL;

-- 7. Helper: check admin
-- has_role already exists. Define a small wrapper for readability.
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- 8. validate_license (read-only verifier — never mutates)
CREATE OR REPLACE FUNCTION public.validate_license(
  _license_key text,
  _device_id text,
  _fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lic public.licenses%ROWTYPE;
  v_dev public.devices%ROWTYPE;
BEGIN
  IF _license_key IS NULL OR length(_license_key) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_dev FROM public.devices WHERE device_id = _device_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_registered');
  END IF;
  IF v_dev.is_blocked OR v_dev.is_banned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE license_key = _license_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_lic.status::text = 'revoked'   THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked');   END IF;
  IF v_lic.status::text = 'suspended' THEN RETURN jsonb_build_object('ok', false, 'reason', 'suspended'); END IF;
  IF v_lic.status::text = 'pending'   THEN RETURN jsonb_build_object('ok', false, 'reason', 'pending');   END IF;

  IF NOT COALESCE(v_lic.permanent,false)
     AND v_lic.expiry_date IS NOT NULL
     AND v_lic.expiry_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_lic.device_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unbound');
  END IF;
  IF v_lic.device_id <> _device_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mismatch');
  END IF;
  IF _fingerprint IS NOT NULL
     AND v_lic.device_fingerprint IS NOT NULL
     AND v_lic.device_fingerprint <> _fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'active', 'license', to_jsonb(v_lic));
END;
$$;

-- 9. device_heartbeat (authoritative read for the client gate)
CREATE OR REPLACE FUNCTION public.device_heartbeat(
  _device_id text,
  _fingerprint text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  -- Upsert device — first heartbeat auto-registers
  INSERT INTO public.devices (device_id, user_id, device_fingerprint, app_version, platform,
                              last_seen, last_seen_at, last_sync_at, last_activity_at, first_seen_at)
  VALUES (_device_id, v_uid, _fingerprint, _app_version, _platform,
          now(), now(), now(), now(), now())
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

  SELECT (value #>> '{}')::text INTO v_min_ver FROM public.system_config WHERE key='minimum_supported_version';
  SELECT (value)::boolean       INTO v_force   FROM public.system_config WHERE key='force_update_enabled';
  SELECT (value)::boolean       INTO v_maint   FROM public.system_config WHERE key='maintenance_mode';

  -- Active license (if any)
  SELECT * INTO v_lic FROM public.licenses
   WHERE device_id = _device_id
     AND status::text IN ('active','suspended')
   ORDER BY updated_at DESC LIMIT 1;

  -- Trial row (if any)
  SELECT * INTO v_trial FROM public.trials WHERE device_id = _device_id;

  -- Resolve state — server is source of truth
  IF COALESCE(v_maint,false) THEN
    v_state := 'maintenance'; v_reason := 'maintenance_mode';
  ELSIF v_dev.is_blocked OR v_dev.is_banned THEN
    v_state := 'blocked'; v_reason := COALESCE(v_dev.block_reason, v_dev.ban_reason, 'blocked');
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'suspended' THEN
    v_state := 'suspended'; v_reason := 'license_suspended';
  ELSIF v_lic.id IS NOT NULL
        AND v_lic.status::text = 'active'
        AND (COALESCE(v_lic.permanent,false) OR v_lic.expiry_date IS NULL OR v_lic.expiry_date >= CURRENT_DATE) THEN
    v_state := 'license_active'; v_reason := 'ok';
  ELSIF v_lic.id IS NOT NULL
        AND NOT COALESCE(v_lic.permanent,false)
        AND v_lic.expiry_date IS NOT NULL
        AND v_lic.expiry_date < CURRENT_DATE THEN
    v_state := 'license_expired'; v_reason := 'license_expired';
  ELSIF v_trial.id IS NOT NULL
        AND v_trial.status = 'active'
        AND v_trial.expires_at > now() THEN
    v_state := 'trial_active'; v_reason := 'ok';
  ELSIF v_trial.id IS NOT NULL
        AND (v_trial.status <> 'active' OR v_trial.expires_at <= now()) THEN
    v_state := 'trial_expired'; v_reason := 'trial_expired';
  ELSE
    v_state := 'not_registered'; v_reason := 'no_trial_no_license';
  END IF;

  -- Force-update check overrides positive states (but not block)
  IF COALESCE(v_force,false) AND v_min_ver IS NOT NULL AND _app_version IS NOT NULL
     AND _app_version < v_min_ver
     AND v_state IN ('license_active','trial_active') THEN
    v_state := 'force_update'; v_reason := 'app_version_too_old';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'reason', v_reason,
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

-- 10. Admin license RPCs
CREATE OR REPLACE FUNCTION public.admin_set_license_status(
  _license_id uuid, _status text, _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.licenses%ROWTYPE; v_new public.licenses%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF _status NOT IN ('active','expired','revoked','pending','suspended') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  SELECT * INTO v_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;

  UPDATE public.licenses SET status = _status::license_status, updated_at = now()
   WHERE id = _license_id RETURNING * INTO v_new;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values, metadata)
  VALUES (v_uid, v_new.user_id, v_new.device_id, 'admin_set_license_status', 'licenses', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new), jsonb_build_object('reason', _reason));
  RETURN jsonb_build_object('ok', true, 'license', to_jsonb(v_new));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_extend_license(
  _license_id uuid, _new_expiry date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.licenses%ROWTYPE; v_new public.licenses%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  UPDATE public.licenses
     SET expiry_date = _new_expiry, permanent = false, status='active'::license_status, updated_at=now()
   WHERE id = _license_id RETURNING * INTO v_new;
  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, v_new.user_id, v_new.device_id, 'admin_extend_license', 'licenses', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'license',to_jsonb(v_new));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_convert_license(
  _license_id uuid, _permanent boolean, _expiry date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.licenses%ROWTYPE; v_new public.licenses%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF NOT _permanent AND _expiry IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','expiry_required');
  END IF;
  SELECT * INTO v_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  UPDATE public.licenses
     SET permanent=_permanent,
         expiry_date = CASE WHEN _permanent THEN NULL ELSE _expiry END,
         status='active'::license_status,
         updated_at=now()
   WHERE id = _license_id RETURNING * INTO v_new;
  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, v_new.user_id, v_new.device_id, 'admin_convert_license', 'licenses', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'license',to_jsonb(v_new));
END; $$;

-- 11. Admin device RPCs
CREATE OR REPLACE FUNCTION public.admin_block_device(_device_id text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.devices%ROWTYPE; v_new public.devices%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.devices WHERE device_id = _device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  UPDATE public.devices
     SET is_blocked=true, block_reason=_reason, lifecycle_state='blocked', updated_at=now()
   WHERE device_id = _device_id RETURNING * INTO v_new;
  INSERT INTO public.device_bans(device_id, user_id, reason, banned_by)
  VALUES (_device_id, v_new.user_id, _reason, v_uid);
  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, v_new.user_id, _device_id, 'admin_block_device', 'devices', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'device',to_jsonb(v_new));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_device(_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.devices%ROWTYPE; v_new public.devices%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.devices WHERE device_id = _device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  UPDATE public.devices
     SET is_blocked=false, is_banned=false, block_reason=NULL, ban_reason=NULL,
         lifecycle_state=NULL, updated_at=now()
   WHERE device_id = _device_id RETURNING * INTO v_new;
  UPDATE public.device_bans SET lifted_at=now() WHERE device_id=_device_id AND lifted_at IS NULL;
  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, v_new.user_id, _device_id, 'admin_unblock_device', 'devices', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'device',to_jsonb(v_new));
END; $$;

-- 12. Admin trial RPCs
CREATE OR REPLACE FUNCTION public.admin_extend_trial(_device_id text, _days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.trials%ROWTYPE; v_new public.trials%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.trials WHERE device_id = _device_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.trials(device_id, started_at, expires_at, days_total, status,
                              extended_by_admin, extended_by_days)
    VALUES (_device_id, now(), now() + (_days||' days')::interval, _days, 'active', true, _days)
    RETURNING * INTO v_new;
  ELSE
    UPDATE public.trials
       SET expires_at = GREATEST(expires_at, now()) + (_days||' days')::interval,
           status='active', extended_by_admin=true,
           extended_by_days=extended_by_days + _days, updated_at=now()
     WHERE device_id = _device_id RETURNING * INTO v_new;
  END IF;
  INSERT INTO public.audit_logs(actor_user_id, device_id, action, entity, entity_id,
                                old_values, new_values, metadata)
  VALUES (v_uid, _device_id, 'admin_extend_trial', 'trials', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new), jsonb_build_object('days', _days));
  RETURN jsonb_build_object('ok',true,'trial',to_jsonb(v_new));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_end_trial(_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.trials%ROWTYPE; v_new public.trials%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.trials WHERE device_id = _device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  UPDATE public.trials
     SET status='cancelled', cancelled_at=now(), expires_at=LEAST(expires_at, now()), updated_at=now()
   WHERE device_id = _device_id RETURNING * INTO v_new;
  INSERT INTO public.audit_logs(actor_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, _device_id, 'admin_end_trial', 'trials', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'trial',to_jsonb(v_new));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_convert_trial(_device_id text, _license_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.trials%ROWTYPE; v_new public.trials%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  SELECT * INTO v_old FROM public.trials WHERE device_id = _device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','no_trial'); END IF;
  UPDATE public.trials
     SET status='converted', converted_license_id=_license_id, updated_at=now()
   WHERE device_id = _device_id RETURNING * INTO v_new;
  INSERT INTO public.audit_logs(actor_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, _device_id, 'admin_convert_trial', 'trials', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'trial',to_jsonb(v_new));
END; $$;

-- 13. Admin activation decision RPC
CREATE OR REPLACE FUNCTION public.admin_decide_activation(
  _request_id uuid,
  _decision text,                 -- 'approved' | 'rejected'
  _license_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.activations%ROWTYPE; v_new public.activations%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF _decision NOT IN ('approved','rejected') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_decision');
  END IF;
  SELECT * INTO v_old FROM public.activations WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;

  UPDATE public.activations
     SET status = _decision::activation_status,
         processed_by = v_uid, processed_at = now(),
         license_id = COALESCE(_license_id, license_id),
         notes = COALESCE(_notes, notes)
   WHERE id = _request_id RETURNING * INTO v_new;

  -- If approved and a license is supplied, bind it to the requesting device
  IF _decision = 'approved' AND _license_id IS NOT NULL THEN
    UPDATE public.licenses
       SET device_id = v_new.device_id,
           user_id   = COALESCE(user_id, v_new.user_id),
           status    = 'active'::license_status,
           activated_at = COALESCE(activated_at, now()),
           updated_at = now()
     WHERE id = _license_id;
  END IF;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id,
                                old_values, new_values)
  VALUES (v_uid, v_new.user_id, v_new.device_id, 'admin_decide_activation', 'activations', v_new.id::text,
          to_jsonb(v_old), to_jsonb(v_new));
  RETURN jsonb_build_object('ok',true,'activation',to_jsonb(v_new));
END; $$;

-- 14. Grants on new RPCs
REVOKE ALL ON FUNCTION public.validate_license(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.device_heartbeat(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_license(text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.device_heartbeat(text,text,text,text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_license_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_extend_license(uuid,date)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_convert_license(uuid,boolean,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_block_device(text,text)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unblock_device(text)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_extend_trial(text,integer)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_end_trial(text)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_convert_trial(text,uuid)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_decide_activation(uuid,text,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_set_license_status(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_license(uuid,date)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_convert_license(uuid,boolean,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_block_device(text,text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_unblock_device(text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(text,integer)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_end_trial(text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_convert_trial(text,uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_activation(uuid,text,uuid,text) TO authenticated, service_role;
