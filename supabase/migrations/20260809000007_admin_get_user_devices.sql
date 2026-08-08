-- =============================================================================
-- RPC: admin_get_user_devices
-- Returns all devices that logged in for a given user, the active device,
-- and revoked/blocked devices. Admin only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_user_devices(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_current_device text;
  v_result jsonb;
BEGIN
  v_uid := public._require_admin();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  SELECT p.current_device INTO v_current_device
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  WITH devices_with_sessions AS (
    SELECT
      d.device_id,
      COALESCE(NULLIF(d.device_name, ''), d.name) AS device_name,
      COALESCE(NULLIF(d.device_model, ''), d.model) AS device_model,
      d.platform,
      d.app_version,
      COALESCE(d.first_seen_at, d.created_at) AS first_seen_at,
      GREATEST(
        COALESCE(d.last_seen_at, d.last_seen),
        (SELECT max(s.last_seen_at) FROM public.sessions s
          WHERE s.user_id = d.user_id AND s.device_id = d.device_id)
      ) AS last_seen_at,
      d.is_active,
      COALESCE(d.is_blocked, false) AS is_blocked,
      COALESCE(d.is_banned, false) AS is_banned,
      d.lifecycle_state,
      (SELECT count(*) FROM public.sessions s
        WHERE s.user_id = d.user_id AND s.device_id = d.device_id)::int AS session_count,
      (SELECT count(*) FROM public.sessions s
        WHERE s.user_id = d.user_id AND s.device_id = d.device_id AND s.revoked_at IS NOT NULL)::int AS revoked_count,
      EXISTS (SELECT 1 FROM public.sessions s
        WHERE s.user_id = d.user_id AND s.device_id = d.device_id AND s.revoked_at IS NULL) AS has_active_session
    FROM public.devices d
    WHERE d.user_id = _user_id
  ),
  session_only AS (
    SELECT
      s.device_id,
      NULL::text AS device_name,
      NULL::text AS device_model,
      NULL::text AS platform,
      NULL::text AS app_version,
      min(s.created_at) AS first_seen_at,
      max(s.last_seen_at) AS last_seen_at,
      true AS is_active,
      false AS is_blocked,
      false AS is_banned,
      NULL::text AS lifecycle_state,
      count(*)::int AS session_count,
      count(*) FILTER (WHERE s.revoked_at IS NOT NULL)::int AS revoked_count,
      bool_or(s.revoked_at IS NULL) AS has_active_session
    FROM public.sessions s
    WHERE s.user_id = _user_id
      AND NOT EXISTS (SELECT 1 FROM public.devices d
        WHERE d.user_id = s.user_id AND d.device_id = s.device_id)
    GROUP BY s.device_id
  ),
  combined AS (
    SELECT * FROM devices_with_sessions
    UNION ALL
    SELECT * FROM session_only
  )
  SELECT jsonb_build_object(
    'ok', true,
    'current_device', v_current_device,
    'devices', COALESCE(jsonb_agg(
      jsonb_build_object(
        'device_id', device_id,
        'device_name', device_name,
        'device_model', device_model,
        'platform', platform,
        'app_version', app_version,
        'first_seen_at', first_seen_at,
        'last_seen_at', last_seen_at,
        'is_active', is_active,
        'is_blocked', is_blocked,
        'is_banned', is_banned,
        'lifecycle_state', lifecycle_state,
        'session_count', session_count,
        'revoked_count', revoked_count,
        'has_active_session', has_active_session,
        'is_current', (device_id = v_current_device),
        'status', CASE
          WHEN device_id = v_current_device THEN 'active'
          WHEN is_blocked OR is_banned THEN 'blocked'
          WHEN has_active_session THEN 'registered'
          WHEN revoked_count > 0 OR NOT is_active THEN 'revoked'
          ELSE 'registered'
        END
      )
      ORDER BY (device_id = v_current_device) DESC, last_seen_at DESC NULLS LAST
    ), '[]'::jsonb)
  ) INTO v_result
  FROM combined;

  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.admin_get_user_devices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_devices(uuid) TO authenticated, service_role;
