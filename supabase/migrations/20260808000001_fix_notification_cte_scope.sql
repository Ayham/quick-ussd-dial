-- Fix: notification list functions referenced the `base` CTE across separate
-- SQL statements. In PL/pgSQL each statement is independent, so the second
-- reference raised `42P01: relation "base" does not exist`.
-- Fix folds total + items into a single statement so the CTE stays in scope.

CREATE OR REPLACE FUNCTION public.user_get_notifications(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 30,
  p_filter TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_order TEXT DEFAULT 'newest',
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_include_dismissed BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 30), 1), 100);
  v_offset INTEGER := (v_page - 1) * v_page_size;
  v_total BIGINT;
  v_unread BIGINT;
  v_items JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH base AS (
    SELECT
      r.notification_id AS id,
      n.title_ar, n.title_en, n.body_ar, n.body_en,
      n.notification_type, n.priority, n.status,
      n.created_at, n.updated_at, n.sent_at, n.expires_at,
      n.action_type, n.action_target, n.image_url,
      n.requires_acknowledgement, n.is_pinned, n.is_announcement,
      n.metadata, n.version,
      r.id AS recipient_id,
      r.status AS recipient_status,
      r.delivered_at, r.read_at, r.acknowledged_at, r.dismissed_at,
      r.is_read, r.is_favorite, r.is_deleted,
      r.delivered_version, r.read_version
    FROM public.notification_recipients r
    JOIN public.notifications n ON n.id = r.notification_id
    WHERE r.user_id = v_uid
      AND NOT r.is_deleted
      AND NOT n.is_deleted
      AND n.status IN ('sent', 'archived')
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (p_include_dismissed OR r.dismissed_at IS NULL)
      AND (p_since IS NULL
           OR n.created_at >= p_since OR n.updated_at >= p_since
           OR r.created_at >= p_since OR r.updated_at >= p_since)
      AND (p_filter IS NULL OR p_filter = ''
           OR (p_filter = 'unread' AND NOT r.is_read)
           OR (p_filter = 'read' AND r.is_read))
      AND (p_type IS NULL OR p_type = '' OR n.notification_type::text = p_type)
      AND (p_priority IS NULL OR p_priority = '' OR n.priority::text = p_priority)
      AND (p_search IS NULL OR p_search = ''
           OR n.title_ar ILIKE '%' || p_search || '%'
           OR n.title_en ILIKE '%' || p_search || '%'
           OR n.body_ar ILIKE '%' || p_search || '%'
           OR n.body_en ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR n.created_at >= p_date_from)
      AND (p_date_to IS NULL OR n.created_at < p_date_to)
  )
  SELECT
    (SELECT count(*) FROM base) AS total,
    COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) AS items
  INTO v_total, v_items
  FROM (
    SELECT *
    FROM base
    ORDER BY is_pinned DESC,
             (NOT is_read) DESC,
             CASE WHEN p_order = 'oldest' THEN created_at END ASC,
             CASE WHEN p_order <> 'oldest' THEN created_at END DESC
    LIMIT v_page_size OFFSET v_offset
  ) sub;

  SELECT count(*) INTO v_unread
  FROM public.notification_recipients r
  JOIN public.notifications n ON n.id = r.notification_id
  WHERE r.user_id = v_uid
    AND NOT r.is_read AND NOT r.is_deleted AND NOT n.is_deleted
    AND n.status IN ('sent', 'archived')
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND r.dismissed_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'unread_count', v_unread,
    'page', v_page,
    'page_size', v_page_size,
    'has_more', (v_offset + v_page_size) < v_total
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_get_notifications(
  TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_get_notifications(
  TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_notifications(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_status TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset INTEGER := (v_page - 1) * v_page_size;
  v_total BIGINT;
  v_items JSONB;
BEGIN
  v_admin := public._require_admin();
  WITH base AS (
    SELECT
      n.*,
      p.email AS creator_email,
      p.display_name AS creator_name,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND NOT r.is_deleted) AS recipients_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND r.is_read) AS read_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND NOT r.is_read AND NOT r.is_deleted) AS unread_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND r.acknowledged_at IS NOT NULL) AS ack_count
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.user_id = n.created_by
    WHERE (p_include_deleted OR NOT n.is_deleted)
      AND (p_status IS NULL OR p_status = '' OR n.status::text = p_status)
      AND (p_type IS NULL OR p_type = '' OR n.notification_type::text = p_type)
      AND (p_search IS NULL OR p_search = ''
           OR n.title_ar ILIKE '%' || p_search || '%'
           OR n.title_en ILIKE '%' || p_search || '%'
           OR n.body_ar ILIKE '%' || p_search || '%'
           OR n.body_en ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR n.created_at >= p_date_from)
      AND (p_date_to IS NULL OR n.created_at < p_date_to)
  )
  SELECT
    (SELECT count(*) FROM base) AS total,
    COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) AS items
  INTO v_total, v_items
  FROM (
    SELECT * FROM base ORDER BY created_at DESC LIMIT v_page_size OFFSET v_offset
  ) sub;
  RETURN jsonb_build_object('ok', true, 'items', v_items, 'total', v_total,
                            'page', v_page, 'page_size', v_page_size,
                            'has_more', (v_offset + v_page_size) < v_total);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notifications(
  INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notifications(
  INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO authenticated, service_role;
