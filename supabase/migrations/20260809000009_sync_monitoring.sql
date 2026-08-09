-- =============================================================================
-- Sync Monitoring (Admin)
--
-- Real device/sync health for the Admin Sync Monitor tab. The data source is the
-- live `devices` + `transfers` tables (populated by device-sync / heartbeat),
-- NOT the legacy `sync_logs` table, which the current app never writes to.
--
-- Additive only: new columns + one SECURITY DEFINER RPC. No drops, no data loss.
-- =============================================================================

-- 1. devices: pending-queue + last-error tracking, reported by device-sync.
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS pending_sync_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE INDEX IF NOT EXISTS idx_devices_pending_sync ON public.devices (pending_sync_count) WHERE pending_sync_count > 0;

-- 2. admin_get_sync_monitor: per-device sync health + aggregate totals.
-- Same authorization model as every admin RPC: public._require_admin().
CREATE OR REPLACE FUNCTION public.admin_get_sync_monitor(
  _days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _days_int integer := GREATEST(1, LEAST(COALESCE(_days, 7), 90));
  v_result jsonb;
BEGIN
  PERFORM public._require_admin();

  SELECT jsonb_build_object(
    'ok', true,
    'as_of', now(),
    'window_days', _days_int,
    'totals', jsonb_build_object(
      'total_devices', (SELECT count(*) FROM public.devices),
      'active_24h', (SELECT count(*) FROM public.devices WHERE last_seen_at IS NOT NULL AND last_seen_at >= now() - interval '24 hours'),
      'active_7d', (SELECT count(*) FROM public.devices WHERE last_seen_at IS NOT NULL AND last_seen_at >= now() - interval '7 days'),
      'needs_attention', (SELECT count(*) FROM public.devices
                          WHERE COALESCE(pending_sync_count, 0) > 0
                             OR last_sync_at IS NULL
                             OR last_sync_at < now() - interval '24 hours'),
      'with_pending', (SELECT count(*) FROM public.devices WHERE COALESCE(pending_sync_count, 0) > 0),
      'transfers_24h', (SELECT count(*) FROM public.transfers WHERE created_at >= now() - interval '24 hours'),
      'transfers_7d', (SELECT count(*) FROM public.transfers WHERE created_at >= now() - interval '7 days'),
      'transfers_failed_7d', (SELECT count(*) FROM public.transfers
                              WHERE created_at >= now() - interval '7 days'
                                AND status NOT IN ('success', 'completed'))
    ),
    'devices', COALESCE((
      SELECT jsonb_agg(to_jsonb(dev) ORDER BY dev.last_seen_at DESC NULLS LAST, dev.device_id)
      FROM (
        SELECT
          d.device_id,
          d.user_id,
          p.display_name,
          p.email,
          d.app_version,
          d.platform,
          d.lifecycle_state,
          d.is_active,
          d.is_blocked,
          d.last_seen,
          d.last_seen_at,
          d.last_sync_at,
          COALESCE(d.pending_sync_count, 0) AS pending_sync_count,
          d.last_sync_error,
          t_last.transfers_24h,
          t_last.transfers_7d,
          t_last.last_transfer_at
        FROM public.devices d
        LEFT JOIN public.profiles p ON p.user_id = d.user_id
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS transfers_24h,
            count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS transfers_7d,
            max(created_at) AS last_transfer_at
          FROM public.transfers t
          WHERE t.device_id = d.device_id
        ) t_last ON true
      ) dev
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_sync_monitor(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sync_monitor(integer) TO authenticated, service_role;
