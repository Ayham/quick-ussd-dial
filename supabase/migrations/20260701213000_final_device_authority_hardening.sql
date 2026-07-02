-- Final device authority hardening.

CREATE OR REPLACE FUNCTION public.app_version_lt(_current text, _minimum text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  WITH versions AS (
    SELECT
      regexp_replace(COALESCE(_current, '0'), '[^0-9.]', '', 'g') AS current_version,
      regexp_replace(COALESCE(_minimum, '0'), '[^0-9.]', '', 'g') AS minimum_version
  )
  SELECT ARRAY[
           COALESCE(NULLIF(split_part(current_version, '.', 1), ''), '0')::int,
           COALESCE(NULLIF(split_part(current_version, '.', 2), ''), '0')::int,
           COALESCE(NULLIF(split_part(current_version, '.', 3), ''), '0')::int,
           COALESCE(NULLIF(split_part(current_version, '.', 4), ''), '0')::int
         ]
       < ARRAY[
           COALESCE(NULLIF(split_part(minimum_version, '.', 1), ''), '0')::int,
           COALESCE(NULLIF(split_part(minimum_version, '.', 2), ''), '0')::int,
           COALESCE(NULLIF(split_part(minimum_version, '.', 3), ''), '0')::int,
           COALESCE(NULLIF(split_part(minimum_version, '.', 4), ''), '0')::int
         ]
  FROM versions;
$$;

ALTER TABLE public.app_events ADD COLUMN IF NOT EXISTS client_id text;
CREATE UNIQUE INDEX IF NOT EXISTS app_events_device_client_id_key
  ON public.app_events(device_id, client_id) WHERE client_id IS NOT NULL;

-- Protected lifecycle tables are read-only through the Data API. All writes
-- go through service-role Edge Functions or audited SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Admins manage devices" ON public.devices;
DROP POLICY IF EXISTS "Users insert own device" ON public.devices;
DROP POLICY IF EXISTS "Users update own device" ON public.devices;
DROP POLICY IF EXISTS "Admins manage licenses" ON public.licenses;
DROP POLICY IF EXISTS "Admins manage activations" ON public.activations;
DROP POLICY IF EXISTS "Admins manage trials" ON public.trials;
DROP POLICY IF EXISTS "device_bans_admin_all" ON public.device_bans;

CREATE POLICY "Admins read devices" ON public.devices FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read licenses" ON public.licenses FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read activations" ON public.activations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read trials" ON public.trials FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read device bans" ON public.device_bans FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_set_license_level(_license_id uuid, _level text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_old public.licenses%ROWTYPE; v_new public.licenses%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF NULLIF(btrim(_level), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'level_required');
  END IF;
  SELECT * INTO v_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  UPDATE public.licenses SET level = btrim(_level), updated_at = now()
   WHERE id = _license_id RETURNING * INTO v_new;
  INSERT INTO public.audit_logs(
    actor_user_id, target_user_id, device_id, action, entity, entity_id, old_values, new_values
  ) VALUES (
    v_uid, v_new.user_id, v_new.device_id, 'admin_set_license_level', 'licenses',
    v_new.id::text, to_jsonb(v_old), to_jsonb(v_new)
  );
  RETURN jsonb_build_object('ok', true, 'license', to_jsonb(v_new));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_license_level(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_license_level(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_transfer_license(
  _license_id uuid,
  _new_device_id text,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_old public.licenses%ROWTYPE;
  v_new public.licenses%ROWTYPE;
  v_old_device text;
  v_target public.devices%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF NULLIF(btrim(_new_device_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;
  SELECT * INTO v_old FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  v_old_device := v_old.device_id;

  SELECT * INTO v_target FROM public.devices WHERE device_id = _new_device_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'target_not_registered'); END IF;
  IF v_target.is_blocked OR v_target.is_banned THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'target_device_blocked');
  END IF;

  UPDATE public.licenses
     SET device_id = _new_device_id,
         device_fingerprint = v_target.device_fingerprint,
         user_id = COALESCE(v_target.user_id, user_id),
         status = 'active'::license_status,
         activated_at = now(),
         updated_at = now()
   WHERE id = _license_id
   RETURNING * INTO v_new;

  UPDATE public.devices SET lifecycle_state = 'active', updated_at = now()
   WHERE device_id = _new_device_id;
  UPDATE public.trials
     SET status = 'converted', converted_license_id = v_new.id, updated_at = now()
   WHERE device_id = _new_device_id AND status = 'active';

  IF v_old_device IS NOT NULL AND v_old_device <> _new_device_id THEN
    UPDATE public.devices
       SET lifecycle_state = CASE WHEN is_blocked OR is_banned THEN 'blocked' ELSE 'revoked' END,
           updated_at = now()
     WHERE device_id = v_old_device;
    UPDATE public.trials
       SET status = 'cancelled', cancelled_at = now(), expires_at = LEAST(expires_at, now()), updated_at = now()
     WHERE device_id = v_old_device AND status = 'active';
  END IF;

  INSERT INTO public.audit_logs(
    actor_user_id, target_user_id, device_id, action, entity, entity_id, old_values, new_values, metadata
  ) VALUES (
    v_uid, v_new.user_id, _new_device_id, 'admin_transfer_license', 'licenses', v_new.id::text,
    to_jsonb(v_old), to_jsonb(v_new),
    jsonb_build_object('from_device', v_old_device, 'to_device', _new_device_id, 'reason', _reason)
  );
  RETURN jsonb_build_object(
    'ok', true, 'license', to_jsonb(v_new), 'from_device', v_old_device, 'to_device', _new_device_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_transfer_license(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_license(uuid,text,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.device_heartbeat(text,text,text,text);

CREATE OR REPLACE FUNCTION public.device_heartbeat(
  _device_id text,
  _fingerprint text DEFAULT NULL,
  _app_instance_id text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _platform text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dev public.devices%ROWTYPE;
  v_lic public.licenses%ROWTYPE;
  v_trial public.trials%ROWTYPE;
  v_min_ver text;
  v_latest_ver text;
  v_force boolean;
  v_maint boolean;
  v_state text;
  v_reason text;
  v_lifecycle text;
BEGIN
  IF _device_id IS NULL OR length(_device_id) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_device');
  END IF;

  SELECT * INTO v_dev FROM public.devices WHERE device_id = _device_id FOR UPDATE;
  IF FOUND AND v_dev.user_id IS NOT NULL AND _user_id IS NOT NULL AND v_dev.user_id <> _user_id THEN
    INSERT INTO public.audit_logs(target_user_id, device_id, action, entity, entity_id, metadata)
    VALUES (v_dev.user_id, _device_id, 'device_owner_mismatch', 'devices', v_dev.id::text,
            jsonb_build_object('attempted_user_id', _user_id));
    RETURN jsonb_build_object('ok', true, 'state', 'device_mismatch', 'reason', 'device_owner_mismatch',
                              'lifecycle_state', 'blocked', 'device', to_jsonb(v_dev));
  END IF;
  IF FOUND AND v_dev.device_fingerprint IS NOT NULL AND _fingerprint IS NOT NULL
     AND v_dev.device_fingerprint <> _fingerprint THEN
    INSERT INTO public.audit_logs(target_user_id, device_id, action, entity, entity_id, metadata)
    VALUES (v_dev.user_id, _device_id, 'fingerprint_mismatch', 'devices', v_dev.id::text,
            jsonb_build_object('stored_fingerprint', v_dev.device_fingerprint, 'attempted_fingerprint', _fingerprint));
    RETURN jsonb_build_object('ok', true, 'state', 'fingerprint_mismatch', 'reason', 'fingerprint_mismatch',
                              'lifecycle_state', 'blocked', 'device', to_jsonb(v_dev));
  END IF;

  INSERT INTO public.devices(
    device_id, user_id, device_fingerprint, app_instance_id, app_version, platform,
    lifecycle_state, last_seen, last_seen_at, last_sync_at, last_activity_at, first_seen_at
  ) VALUES (
    _device_id, _user_id, _fingerprint, _app_instance_id, _app_version, _platform,
    'trial', now(), now(), now(), now(), now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    user_id = COALESCE(public.devices.user_id, EXCLUDED.user_id),
    device_fingerprint = COALESCE(public.devices.device_fingerprint, EXCLUDED.device_fingerprint),
    app_instance_id = COALESCE(EXCLUDED.app_instance_id, public.devices.app_instance_id),
    app_version = COALESCE(EXCLUDED.app_version, public.devices.app_version),
    platform = COALESCE(EXCLUDED.platform, public.devices.platform),
    last_seen = now(), last_seen_at = now(), last_sync_at = now(), last_activity_at = now(), updated_at = now()
  RETURNING * INTO v_dev;

  INSERT INTO public.trials(device_id, user_id, started_at, expires_at, days_total, status)
  VALUES (_device_id, COALESCE(v_dev.user_id, _user_id), now(), now() + interval '30 days', 30, 'active')
  ON CONFLICT (device_id) DO NOTHING;

  SELECT value #>> '{}' INTO v_min_ver FROM public.system_config WHERE key = 'minimum_supported_version';
  SELECT value #>> '{}' INTO v_latest_ver FROM public.system_config WHERE key = 'latest_version';
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_force FROM public.system_config WHERE key = 'force_update_enabled';
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_maint FROM public.system_config WHERE key = 'maintenance_mode';

  SELECT * INTO v_lic FROM public.licenses WHERE device_id = _device_id
   ORDER BY CASE status::text
     WHEN 'active' THEN 1 WHEN 'suspended' THEN 2 WHEN 'revoked' THEN 3 WHEN 'expired' THEN 4 ELSE 5
   END, updated_at DESC LIMIT 1;
  SELECT * INTO v_trial FROM public.trials WHERE device_id = _device_id;

  IF v_maint THEN
    v_state := 'maintenance'; v_reason := 'maintenance_mode'; v_lifecycle := v_dev.lifecycle_state;
  ELSIF v_dev.is_blocked OR v_dev.is_banned THEN
    v_state := 'blocked'; v_reason := COALESCE(v_dev.block_reason, v_dev.ban_reason, 'blocked'); v_lifecycle := 'blocked';
  ELSIF v_lic.id IS NOT NULL AND v_lic.device_fingerprint IS NOT NULL AND _fingerprint IS NOT NULL
        AND v_lic.device_fingerprint <> _fingerprint THEN
    INSERT INTO public.audit_logs(target_user_id, device_id, action, entity, entity_id, metadata)
    VALUES (v_lic.user_id, _device_id, 'license_fingerprint_mismatch', 'licenses', v_lic.id::text,
            jsonb_build_object('stored_fingerprint', v_lic.device_fingerprint, 'attempted_fingerprint', _fingerprint));
    v_state := 'fingerprint_mismatch'; v_reason := 'license_fingerprint_mismatch'; v_lifecycle := 'blocked';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'revoked' THEN
    v_state := 'revoked'; v_reason := 'license_revoked'; v_lifecycle := 'revoked';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'suspended' THEN
    v_state := 'suspended'; v_reason := 'license_suspended'; v_lifecycle := 'suspended';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text IN ('expired', 'inactive') THEN
    v_state := 'license_expired'; v_reason := 'license_inactive'; v_lifecycle := 'revoked';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'pending' THEN
    v_state := 'pending_activation'; v_reason := 'license_pending'; v_lifecycle := 'pending_activation';
  ELSIF v_lic.id IS NOT NULL AND v_lic.status::text = 'active'
        AND (COALESCE(v_lic.permanent, false) OR v_lic.expiry_date IS NULL OR v_lic.expiry_date >= CURRENT_DATE) THEN
    v_state := 'license_active'; v_reason := 'ok'; v_lifecycle := 'active';
  ELSIF v_lic.id IS NOT NULL AND v_lic.expiry_date IS NOT NULL AND v_lic.expiry_date < CURRENT_DATE THEN
    v_state := 'license_expired'; v_reason := 'license_expired'; v_lifecycle := 'revoked';
  ELSIF v_trial.id IS NOT NULL AND v_trial.status = 'active' AND v_trial.expires_at > now() THEN
    v_state := 'trial_active'; v_reason := 'ok'; v_lifecycle := 'trial';
  ELSE
    v_state := 'trial_expired'; v_reason := 'trial_expired'; v_lifecycle := 'pending_activation';
  END IF;

  IF v_dev.lifecycle_state IS DISTINCT FROM v_lifecycle THEN
    UPDATE public.devices SET lifecycle_state = v_lifecycle, updated_at = now()
     WHERE device_id = _device_id RETURNING * INTO v_dev;
  END IF;
  IF v_force AND v_min_ver IS NOT NULL AND public.app_version_lt(_app_version, v_min_ver)
     AND v_state IN ('license_active', 'trial_active') THEN
    v_state := 'force_update'; v_reason := 'app_version_too_old';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'state', v_state, 'reason', v_reason, 'lifecycle_state', v_lifecycle,
    'device', to_jsonb(v_dev),
    'license', CASE WHEN v_lic.id IS NOT NULL THEN to_jsonb(v_lic) END,
    'trial', CASE WHEN v_trial.id IS NOT NULL THEN to_jsonb(v_trial) END,
    'force_update', jsonb_build_object(
      'enabled', v_force, 'minimum_version', v_min_ver, 'latest_version', v_latest_ver, 'maintenance', v_maint
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.device_heartbeat(text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_heartbeat(text,text,text,text,text,uuid) TO service_role;

ALTER TABLE public.devices ALTER COLUMN lifecycle_state SET DEFAULT 'pending_activation';
UPDATE public.devices SET lifecycle_state = 'pending_activation' WHERE lifecycle_state IS NULL;
ALTER TABLE public.devices ALTER COLUMN lifecycle_state SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devices_lifecycle_state_check' AND conrelid = 'public.devices'::regclass
  ) THEN
    ALTER TABLE public.devices ADD CONSTRAINT devices_lifecycle_state_check
      CHECK (lifecycle_state IN ('trial','pending_activation','active','suspended','revoked','blocked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transfers_operator_created
  ON public.transfers(operator, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_status_created
  ON public.transfers(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.report_transfers(
  _request_user uuid,
  _is_admin boolean DEFAULT false,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _operator text DEFAULT NULL,
  _status text DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _device_id text DEFAULT NULL,
  _trial_id uuid DEFAULT NULL,
  _license_id uuid DEFAULT NULL,
  _access_source text DEFAULT NULL,
  _period text DEFAULT 'day',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := CASE WHEN _period IN ('day', 'week', 'month') THEN _period ELSE 'day' END;
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(_page_size, 50), 1), 100);
  v_result jsonb;
BEGIN
  IF _request_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH base AS (
    SELECT
      t.id,
      t.client_id,
      t.device_id,
      t.user_id,
      p.email,
      p.display_name,
      t.phone,
      t.amount,
      t.operator,
      t.status,
      t.created_at,
      historical_license.id AS license_id,
      historical_trial.id AS trial_id,
      CASE
        WHEN historical_license.id IS NOT NULL AND historical_license.permanent THEN 'permanent_license'
        WHEN historical_license.id IS NOT NULL THEN 'temporary_license'
        WHEN historical_trial.id IS NOT NULL THEN 'trial'
        ELSE 'none'
      END AS access_source
    FROM public.transfers t
    LEFT JOIN public.profiles p ON p.user_id = t.user_id
    LEFT JOIN LATERAL (
      SELECT l.id, l.permanent
      FROM public.licenses l
      WHERE l.device_id = t.device_id
        AND COALESCE(l.activated_at, l.created_at) <= t.created_at
        AND (l.permanent OR l.expiry_date IS NULL OR l.expiry_date >= t.created_at::date)
      ORDER BY COALESCE(l.activated_at, l.created_at) DESC
      LIMIT 1
    ) historical_license ON true
    LEFT JOIN LATERAL (
      SELECT tr.id
      FROM public.trials tr
      WHERE tr.device_id = t.device_id
        AND tr.started_at <= t.created_at
        AND tr.expires_at >= t.created_at
        AND (tr.cancelled_at IS NULL OR tr.cancelled_at > t.created_at)
      ORDER BY tr.started_at DESC
      LIMIT 1
    ) historical_trial ON historical_license.id IS NULL
    WHERE (_is_admin OR t.user_id = _request_user)
      AND (_date_from IS NULL OR t.created_at >= _date_from)
      AND (_date_to IS NULL OR t.created_at < _date_to)
      AND (_operator IS NULL OR _operator = '' OR t.operator = _operator)
      AND (_status IS NULL OR _status = '' OR t.status = _status)
      AND (_user_id IS NULL OR t.user_id = _user_id)
      AND (_device_id IS NULL OR _device_id = '' OR t.device_id = _device_id)
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE (_trial_id IS NULL OR trial_id = _trial_id)
      AND (_license_id IS NULL OR license_id = _license_id)
      AND (_access_source IS NULL OR _access_source = '' OR access_source = _access_source)
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC, id DESC
    OFFSET (v_page - 1) * v_page_size
    LIMIT v_page_size
  ),
  periods AS (
    SELECT
      date_trunc(v_period, created_at) AS period_start,
      count(*) AS transfer_count,
      count(*) FILTER (WHERE status IN ('success', 'completed')) AS success_count,
      count(*) FILTER (WHERE status NOT IN ('success', 'completed')) AS failure_count,
      COALESCE(sum(amount), 0) AS amount_total
    FROM filtered
    GROUP BY 1
    ORDER BY 1
  ),
  sync_filtered AS (
    SELECT status
    FROM public.sync_logs
    WHERE (_is_admin OR user_id = _request_user)
      AND (_date_from IS NULL OR created_at >= _date_from)
      AND (_date_to IS NULL OR created_at < _date_to)
      AND (_user_id IS NULL OR user_id = _user_id)
      AND (_device_id IS NULL OR _device_id = '' OR device_id = _device_id)
  )
  SELECT jsonb_build_object(
    'ok', true,
    'page', v_page,
    'page_size', v_page_size,
    'total', (SELECT count(*) FROM filtered),
    'amount_total', (SELECT COALESCE(sum(amount), 0) FROM filtered),
    'success_count', (SELECT count(*) FROM filtered WHERE status IN ('success', 'completed')),
    'failure_count', (SELECT count(*) FROM filtered WHERE status NOT IN ('success', 'completed')),
    'sync_total', (SELECT count(*) FROM sync_filtered),
    'sync_failed', (SELECT count(*) FROM sync_filtered WHERE status = 'failed'),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC, id DESC)
      FROM paged
    ), '[]'::jsonb),
    'periods', COALESCE((
      SELECT jsonb_agg(to_jsonb(periods) ORDER BY period_start)
      FROM periods
    ), '[]'::jsonb),
    'by_operator', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', operator, 'count', count, 'amount', amount))
      FROM (
        SELECT operator, count(*) AS count, COALESCE(sum(amount), 0) AS amount
        FROM filtered GROUP BY operator ORDER BY count(*) DESC
      ) grouped
    ), '[]'::jsonb),
    'by_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', status, 'count', count, 'amount', amount))
      FROM (
        SELECT status, count(*) AS count, COALESCE(sum(amount), 0) AS amount
        FROM filtered GROUP BY status ORDER BY count(*) DESC
      ) grouped
    ), '[]'::jsonb),
    'by_access', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', access_source, 'count', count, 'amount', amount))
      FROM (
        SELECT access_source, count(*) AS count, COALESCE(sum(amount), 0) AS amount
        FROM filtered GROUP BY access_source ORDER BY count(*) DESC
      ) grouped
    ), '[]'::jsonb),
    'by_device', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', device_id, 'count', count, 'amount', amount))
      FROM (
        SELECT device_id, count(*) AS count, COALESCE(sum(amount), 0) AS amount
        FROM filtered GROUP BY device_id ORDER BY count(*) DESC LIMIT 100
      ) grouped
    ), '[]'::jsonb),
    'by_user', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', COALESCE(user_id::text, 'anonymous'),
        'label', COALESCE(display_name, email, user_id::text, 'anonymous'),
        'count', count,
        'amount', amount
      ))
      FROM (
        SELECT user_id, max(display_name) AS display_name, max(email) AS email,
          count(*) AS count, COALESCE(sum(amount), 0) AS amount
        FROM filtered GROUP BY user_id ORDER BY count(*) DESC LIMIT 100
      ) grouped
    ), '[]'::jsonb),
    'by_sync_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', status, 'count', count, 'amount', 0))
      FROM (
        SELECT status, count(*) AS count
        FROM sync_filtered GROUP BY status ORDER BY count(*) DESC
      ) grouped
    ), '[]'::jsonb)
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_transfers(
  uuid, boolean, timestamptz, timestamptz, text, text, uuid, text, uuid, uuid, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_transfers(
  uuid, boolean, timestamptz, timestamptz, text, text, uuid, text, uuid, uuid, text, text, integer, integer
) TO service_role;
