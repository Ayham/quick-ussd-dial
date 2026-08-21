-- Migration: Include ussd_credentials in admin_get_users_admin RPC
-- Ensures admin panel receives synced USSD credentials directly from the RPC without client-side RLS hurdles.

CREATE OR REPLACE FUNCTION public.admin_get_users_admin(
  _search text DEFAULT NULL::text,
  _status text DEFAULT NULL::text,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20,
  _account_status text DEFAULT NULL::text,
  _role text DEFAULT NULL::text,
  _activation_status text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _offset INTEGER := (_page - 1) * _page_size; _total BIGINT; _users JSONB;
BEGIN
  PERFORM public._require_admin();

  INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
  SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', au.email), COALESCE(au.created_at, now()), COALESCE(au.created_at, now()) + INTERVAL '15 days', 'trial', 'trial', 'active'
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT count(*) INTO _total FROM public.profiles p
  WHERE (_search IS NULL OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%' OR p.shop_name ILIKE '%' || _search || '%' OR p.city ILIKE '%' || _search || '%')
    AND (_status IS NULL OR p.license_status::TEXT = _status)
    AND (_account_status IS NULL OR p.account_status::TEXT = _account_status)
    AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role::TEXT = _role));

  SELECT jsonb_agg(sub) INTO _users FROM (
    SELECT p.user_id, p.display_name, p.email, p.phone, p.language, p.created_at, p.updated_at,
      p.trial_start, p.trial_end, p.license_status, p.license_type, p.expiry_date,
      p.current_device, p.last_login, p.last_sync, p.account_status,
      p.notes, p.customer_status, p.shop_name, p.city, p.address, p.commission_type,
      p.commission_value, p.commission_min, p.commission_max, p.credit_limit,
      p.emergency_phone, p.service_type, p.full_name, p.avatar_url,
      au.email_confirmed_at, au.phone_confirmed_at, au.last_sign_in_at, au.banned_until,
      CASE WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM p.trial_end - now())::INTEGER) ELSE NULL END AS trial_remaining_days,
      COALESCE(a.status, p.license_status) AS activation_status,
      a.processed_at AS activation_processed_at,
      a.processed_by AS activation_processed_by,
      (SELECT string_agg(DISTINCT ur.role::TEXT, ',' ORDER BY ur.role::TEXT) FROM public.user_roles ur WHERE ur.user_id = p.user_id) AS roles,
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin'::app_role) AS is_admin,
      pay.payments_summary,
      pay.payments_count,
      notif.notifications_summary,
      act.activations_summary,
      ussd.value AS ussd_credentials
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.user_id
    LEFT JOIN public.app_settings ussd ON ussd.user_id = p.user_id AND ussd.key = 'ussd_credentials'
    LEFT JOIN (
      SELECT DISTINCT ON (user_id) id, user_id, status, processed_at, processed_by
      FROM public.activations
      WHERE user_id IS NOT NULL
      ORDER BY user_id, created_at DESC
    ) a ON a.user_id = p.user_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('currency', c.currency, 'total', c.total, 'count', c.cnt) ORDER BY c.currency), '[]'::jsonb) AS payments_summary,
        COALESCE(sum(c.cnt), 0)::INTEGER AS payments_count
      FROM (
        SELECT COALESCE(NULLIF(pm.currency, ''), 'SYP') AS currency, sum(pm.amount) AS total, count(*) AS cnt
        FROM public.payments pm
        WHERE pm.user_id = p.user_id
        GROUP BY 1
      ) c
    ) pay ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'total', count(*),
        'unread', count(*) FILTER (WHERE NOT is_read AND NOT is_deleted),
        'delivered', count(*) FILTER (WHERE status = 'delivered'),
        'failed', count(*) FILTER (WHERE status = 'failed'),
        'pending', count(*) FILTER (WHERE status = 'pending')
      ) AS notifications_summary
      FROM public.notification_recipients nr
      WHERE nr.user_id = p.user_id
    ) notif ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'total', count(*),
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'approved', count(*) FILTER (WHERE status = 'approved'),
        'rejected', count(*) FILTER (WHERE status = 'rejected'),
        'latest_status', (array_agg(ac.status ORDER BY ac.created_at DESC))[1],
        'latest_at', max(ac.created_at)
      ) AS activations_summary
      FROM public.activations ac
      WHERE ac.user_id = p.user_id
    ) act ON true
    WHERE (_search IS NULL OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%' OR p.shop_name ILIKE '%' || _search || '%' OR p.city ILIKE '%' || _search || '%')
      AND (_status IS NULL OR p.license_status::TEXT = _status)
      AND (_account_status IS NULL OR p.account_status::TEXT = _account_status)
      AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role::TEXT = _role))
    ORDER BY p.created_at DESC
    OFFSET _offset LIMIT _page_size
  ) sub;

  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::jsonb), 'total', _total);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_users_admin(text, text, integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users_admin(text, text, integer, integer, text, text, text) TO authenticated, service_role;
