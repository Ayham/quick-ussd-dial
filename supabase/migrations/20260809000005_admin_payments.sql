-- =============================================================================
-- Admin Payments management (reuses existing public.payments table)
--
-- Adds: payment_date, payment_for, updated_by columns (idempotent).
-- Adds admin-only RPCs following the existing _require_admin() + audit_logs
-- pattern used by every other admin RPC (admin_reset_user_device etc.):
--   admin_get_user_payments(_user_id)           -> list + per-currency totals
--   admin_add_payment(...)                       -> insert (admin only)
--   admin_update_payment(...)                    -> update (admin only)
--   admin_delete_payment(_payment_id)            -> delete (admin only)
--
-- Security model:
--   * All four RPCs call public._require_admin() first (SECURITY DEFINER).
--   * Normal authenticated users cannot INSERT/UPDATE/DELETE payments
--     directly. The pre-existing RLS policies on payments only expose the
--     legacy distributor/customer workflow (payments_owner_insert allows a
--     user to insert a row where user_id = auth.uid(); pm_customer_own only
--     allows reading rows where customer_id = auth.uid()). We do NOT add any
--     policy granting general users access to these admin RPCs.
--   * No currency/method CHECK constraints are added to the shared table
--     because the legacy distributor flow writes free-form values into it.
--     Instead the admin RPCs validate currency ('SYP','USD') and method
--     ('sham_cash','syriatel_cash','mtn_cash','cash') themselves.
--   * Every insert/update/delete writes an audit_logs row.
-- =============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_for text,
  ADD COLUMN IF NOT EXISTS payment_date timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;

UPDATE public.payments SET payment_date = created_at WHERE payment_date IS NULL;
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT now();
ALTER TABLE public.payments ALTER COLUMN payment_date SET NOT NULL;

-- -----------------------------------------------------------------------------
-- admin_get_user_payments: list + totals per currency (never mixes currencies)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user_payments(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_rows jsonb;
  v_totals jsonb;
  v_total bigint;
BEGIN
  v_uid := public._require_admin();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  SELECT count(*) INTO v_total FROM public.payments WHERE user_id = _user_id;

  SELECT jsonb_agg(row_to_json(t)) INTO v_rows FROM (
    SELECT p.id, p.user_id, p.amount, p.currency, p.payment_date, p.payment_method, p.method,
           p.payment_for, p.notes, p.reference, p.status, p.created_at, p.updated_at,
           p.created_by, p.updated_by,
           COALESCE(cb.display_name, 'System') AS created_by_name,
           COALESCE(ub.display_name, NULL) AS updated_by_name
    FROM public.payments p
    LEFT JOIN public.profiles cb ON cb.user_id = p.created_by
    LEFT JOIN public.profiles ub ON ub.user_id = p.updated_by
    WHERE p.user_id = _user_id
    ORDER BY p.payment_date DESC, p.created_at DESC
  ) t;

  SELECT jsonb_agg(to_jsonb(x)) INTO v_totals FROM (
    SELECT COALESCE(NULLIF(p.currency, ''), 'SYP') AS currency,
           sum(p.amount) AS total,
           count(*) AS count
    FROM public.payments p
    WHERE p.user_id = _user_id
    GROUP BY COALESCE(NULLIF(p.currency, ''), 'SYP')
    ORDER BY currency
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', _user_id,
    'total_count', v_total,
    'payments', COALESCE(v_rows, '[]'::jsonb),
    'totals', COALESCE(v_totals, '[]'::jsonb)
  );
END; $$;

-- -----------------------------------------------------------------------------
-- admin_add_payment: insert a payment for a user (admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_payment(
  _user_id uuid,
  _amount numeric,
  _currency text,
  _payment_date timestamptz,
  _payment_method text,
  _payment_for text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
  v_currency text;
  v_method text;
  v_exists boolean;
BEGIN
  v_uid := public._require_admin();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  v_currency := COALESCE(NULLIF(upper(trim(_currency)), ''), 'SYP');
  IF v_currency NOT IN ('SYP', 'USD') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_currency');
  END IF;

  v_method := COALESCE(NULLIF(trim(_payment_method), ''), 'cash');
  IF v_method NOT IN ('sham_cash', 'syriatel_cash', 'mtn_cash', 'cash') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_method');
  END IF;

  INSERT INTO public.payments (user_id, amount, currency, payment_date, payment_method, method, payment_for, status, created_by, updated_by)
  VALUES (_user_id, _amount, v_currency, COALESCE(_payment_date, now()), v_method, v_method, NULLIF(trim(_payment_for), ''), 'confirmed', v_uid, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, action, entity, entity_id, old_values, new_values, metadata)
  VALUES (v_uid, _user_id, 'payment_add', 'payments', v_id::text, NULL,
          jsonb_build_object('amount', _amount, 'currency', v_currency, 'payment_date', COALESCE(_payment_date, now()), 'method', v_method, 'payment_for', _payment_for),
          jsonb_build_object('actor_role', 'admin'));

  RETURN jsonb_build_object('ok', true, 'payment_id', v_id);
END; $$;

-- -----------------------------------------------------------------------------
-- admin_update_payment: update a payment (admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_payment(
  _payment_id uuid,
  _amount numeric,
  _currency text,
  _payment_date timestamptz,
  _payment_method text,
  _payment_for text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row public.payments%ROWTYPE;
  v_currency text;
  v_method text;
  v_target uuid;
BEGIN
  v_uid := public._require_admin();
  IF _payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_payment');
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;
  v_target := v_row.user_id;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  v_currency := COALESCE(NULLIF(upper(trim(_currency)), ''), 'SYP');
  IF v_currency NOT IN ('SYP', 'USD') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_currency');
  END IF;

  v_method := COALESCE(NULLIF(trim(_payment_method), ''), 'cash');
  IF v_method NOT IN ('sham_cash', 'syriatel_cash', 'mtn_cash', 'cash') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_method');
  END IF;

  UPDATE public.payments
     SET amount = _amount,
         currency = v_currency,
         payment_date = COALESCE(_payment_date, v_row.payment_date, now()),
         payment_method = v_method,
         method = v_method,
         payment_for = NULLIF(trim(_payment_for), ''),
         updated_by = v_uid,
         updated_at = now()
   WHERE id = _payment_id;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, action, entity, entity_id, old_values, new_values, metadata)
  VALUES (v_uid, v_target, 'payment_update', 'payments', _payment_id::text,
          jsonb_build_object('amount', v_row.amount, 'currency', v_row.currency, 'payment_date', v_row.payment_date, 'method', v_row.method, 'payment_for', v_row.payment_for),
          jsonb_build_object('amount', _amount, 'currency', v_currency, 'payment_date', COALESCE(_payment_date, v_row.payment_date), 'method', v_method, 'payment_for', _payment_for),
          jsonb_build_object('actor_role', 'admin'));

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id);
END; $$;

-- -----------------------------------------------------------------------------
-- admin_delete_payment: delete a payment (admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_payment(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row public.payments%ROWTYPE;
BEGIN
  v_uid := public._require_admin();
  IF _payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_payment');
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  DELETE FROM public.payments WHERE id = _payment_id;

  INSERT INTO public.audit_logs(actor_user_id, target_user_id, action, entity, entity_id, old_values, new_values, metadata)
  VALUES (v_uid, v_row.user_id, 'payment_delete', 'payments', _payment_id::text,
          jsonb_build_object('amount', v_row.amount, 'currency', v_row.currency, 'payment_date', v_row.payment_date, 'method', v_row.method, 'payment_for', v_row.payment_for),
          NULL,
          jsonb_build_object('actor_role', 'admin'));

  RETURN jsonb_build_object('ok', true, 'payment_id', _payment_id);
END; $$;

REVOKE ALL ON FUNCTION public.admin_get_user_payments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_payment(uuid, numeric, text, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_payment(uuid, numeric, text, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_payment(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_user_payments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_payment(uuid, numeric, text, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_payment(uuid, numeric, text, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_payment(uuid) TO authenticated, service_role;
