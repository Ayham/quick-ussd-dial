-- Reports must reflect the actual balance deducted from the SIM, never the
-- raw transfer quantity.
--
-- Syriatel stores its USSD transfer quantity encoded in units of 1/100
-- (e.g. `amount = 2019` represents 20.19 SYP), so the real deducted balance
-- is `amount / 100`. All other operators use the raw `amount`.
--
-- This replaces the previous behaviour that preferred `package_price`
-- (the selling price) and fell back to the raw `amount` for legacy rows.

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
      CASE WHEN lower(t.operator) = 'syriatel' THEN t.amount / 100.0 ELSE t.amount END AS amount,
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
  )
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
