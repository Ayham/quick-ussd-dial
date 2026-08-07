-- Fix: admin_get_notification_stats returned a jsonb without an `ok` key.
-- The frontend callRpc contract requires `ok: true`; a missing key made
-- callRpc throw, surfacing as the generic "load failed" toast with no
-- network error in the console.

CREATE OR REPLACE FUNCTION public.admin_get_notification_stats()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_result JSONB;
BEGIN
  v_admin := public._require_admin();
  SELECT jsonb_build_object(
    'ok', true,
    'total', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted),
    'sent_today', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= date_trunc('day', now())),
    'sent_week', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= now() - INTERVAL '7 days'),
    'sent_month', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= date_trunc('month', now())),
    'scheduled', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND status = 'scheduled'),
    'pinned', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND is_pinned),
    'drafts', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND status = 'draft'),
    'unread', (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_read AND NOT r.is_deleted AND NOT n.is_deleted),
    'read', (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE r.is_read AND NOT r.is_deleted AND NOT n.is_deleted),
    'read_pct', CASE WHEN (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_deleted AND NOT n.is_deleted) = 0 THEN 0
                     ELSE round(100.0 * (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE r.is_read AND NOT r.is_deleted AND NOT n.is_deleted)
                              / (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_deleted AND NOT n.is_deleted), 1) END,
    'avg_read_minutes', COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (r.read_at - COALESCE(r.delivered_at, n.sent_at, n.created_at))) / 60.0), 1)
      FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id
      WHERE r.read_at IS NOT NULL AND NOT r.is_deleted AND NOT n.is_deleted
    ), 0),
    'acknowledged', (SELECT count(*) FROM public.notification_recipients WHERE acknowledged_at IS NOT NULL AND NOT is_deleted),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', notification_type, 'count', count))
      FROM (SELECT notification_type, count(*) FROM public.notifications WHERE NOT is_deleted GROUP BY notification_type ORDER BY count DESC) t
    ), '[]'::jsonb),
    'by_priority', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', priority, 'count', count))
      FROM (SELECT priority, count(*) FROM public.notifications WHERE NOT is_deleted GROUP BY priority ORDER BY count DESC) t
    ), '[]'::jsonb),
    'top_users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'label', COALESCE(display_name, email, user_id::text), 'read_count', read_count))
      FROM (
        SELECT r.user_id, max(p.display_name) AS display_name, max(p.email) AS email, count(*) AS read_count
        FROM public.notification_recipients r
        LEFT JOIN public.profiles p ON p.user_id = r.user_id
        WHERE r.read_at IS NOT NULL AND NOT r.is_deleted
        GROUP BY r.user_id ORDER BY read_count DESC LIMIT 10
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notification_stats() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_stats() TO authenticated, service_role;
