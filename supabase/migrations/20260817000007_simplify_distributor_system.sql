-- ============================================================
-- SIMPLIFIED DISTRIBUTOR SYSTEM (v2)
-- Migration: 20260817000007
--
-- Model:
--   Distributor = regular user with 'distributor' role + distributors row
--   Customer enters distributor code ONCE in Settings → permanent link
--   Commission calculated on payment approval (not per-transfer)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CLEANUP: Drop old migration's objects
-- ────────────────────────────────────────────────────────────

-- Drop old complex RPCs from migration 20260817000006
DROP FUNCTION IF EXISTS admin_create_distributor(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS admin_update_distributor(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS admin_get_distributors(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS admin_get_distributor_detail(UUID);
DROP FUNCTION IF EXISTS admin_assign_customer_to_distributor(UUID, UUID);
DROP FUNCTION IF EXISTS admin_remove_customer_from_distributor(UUID);
DROP FUNCTION IF EXISTS admin_get_customers_with_distributor(TEXT, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS admin_get_distributor_report(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS distributor_get_dashboard();
DROP FUNCTION IF EXISTS distributor_get_customers(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS distributor_get_customer_detail(UUID);
DROP FUNCTION IF EXISTS distributor_get_transactions(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS distributor_get_report(TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS generate_distributor_code();

-- Also drop old pre-existing functions from earlier attempts
DROP FUNCTION IF EXISTS get_distributor_profile();
DROP FUNCTION IF EXISTS get_distributor_id_for_user(UUID);
DROP FUNCTION IF EXISTS get_distributor_customers(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_distributor_transfers(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_distributor_stats();

-- Drop distributor_transactions (commissions now live on payments table)
DROP TABLE IF EXISTS public.distributor_transactions CASCADE;

-- ────────────────────────────────────────────────────────────
-- 2. ADD user_id TO distributors
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'distributors' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.distributors ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distributors_user_id ON public.distributors(user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. ADD COMMISSION FIELDS TO payments
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN commission_rate NUMERIC(5,2);
    ALTER TABLE public.payments ADD COLUMN commission_amount NUMERIC(15,2);
  END IF;

  -- Add FK for existing distributor_id (it exists but has no FK constraint)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_distributor_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_distributor_id_fkey
      FOREIGN KEY (distributor_id) REFERENCES public.distributors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. PREVENT CHANGING DISTRIBUTOR LINK (one-time only)
-- ────────────────────────────────────────────────────────────

-- Trigger: block UPDATE of distributor_id on profiles if already set
CREATE OR REPLACE FUNCTION prevent_distributor_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.distributor_id IS NOT NULL AND NEW.distributor_id IS DISTINCT FROM OLD.distributor_id THEN
    RAISE EXCEPTION 'Distributor link cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_distributor_change ON public.profiles;
CREATE TRIGGER trg_prevent_distributor_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_distributor_change();

-- ────────────────────────────────────────────────────────────
-- 5. AUTO-CALCULATE COMMISSION ON PAYMENT APPROVAL
-- ────────────────────────────────────────────────────────────

-- When a payment is approved, if the customer has a distributor,
-- snapshop the commission rate and calculate the amount.
CREATE OR REPLACE FUNCTION calculate_distributor_commission()
RETURNS TRIGGER AS $$
DECLARE
  _dist_rate NUMERIC;
BEGIN
  -- Only when status changes to 'approved' or 'confirmed'
  IF NEW.status IN ('approved', 'confirmed') AND (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'confirmed')) THEN
    -- Look up distributor's commission rate from the customer's profile
    IF NEW.distributor_id IS NOT NULL THEN
      SELECT d.commission_rate INTO _dist_rate
      FROM public.distributors d WHERE d.id = NEW.distributor_id AND d.status = 'active';

      IF _dist_rate IS NOT NULL THEN
        NEW.commission_rate := _dist_rate;
        NEW.commission_amount := ROUND(NEW.amount * _dist_rate / 100, 2);
      END IF;
    ELSIF NEW.user_id IS NOT NULL THEN
      -- Auto-lookup distributor from customer profile
      SELECT d.commission_rate, d.id INTO _dist_rate, NEW.distributor_id
      FROM public.profiles p
      JOIN public.distributors d ON d.id = p.distributor_id AND d.status = 'active'
      WHERE p.user_id = NEW.user_id;

      IF _dist_rate IS NOT NULL THEN
        NEW.commission_rate := _dist_rate;
        NEW.commission_amount := ROUND(NEW.amount * _dist_rate / 100, 2);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_distributor_commission ON public.payments;
CREATE TRIGGER trg_calculate_distributor_commission
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_distributor_commission();

-- ────────────────────────────────────────────────────────────
-- 6. RPC FUNCTIONS
-- ============================================================

-- Generate next distributor code
CREATE OR REPLACE FUNCTION generate_distributor_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(d.code FROM 5) AS INTEGER)
  ), 0) + 1 INTO next_num
  FROM public.distributors d
  WHERE d.code ~ '^DST-[0-9]+$';

  new_code := 'DST-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$;

-- ─── ADMIN RPCs ────────────────────────────────────────────

-- Grant distributor role to existing user
CREATE OR REPLACE FUNCTION admin_grant_distributor(
  _user_id UUID,
  _commission_rate NUMERIC DEFAULT 5.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _code TEXT;
  _dist_id UUID;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'distributor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_distributor');
  END IF;

  _code := generate_distributor_code();

  INSERT INTO public.distributors (user_id, code, name, commission_rate, created_by)
  SELECT _user_id, _code, COALESCE(p.display_name, p.email, 'Distributor'), _commission_rate, _admin_id
  FROM public.profiles p WHERE p.user_id = _user_id
  RETURNING id INTO _dist_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'distributor') ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, new_values)
  VALUES (_admin_id, 'DISTRIBUTOR_GRANTED', 'user', _user_id::TEXT,
    jsonb_build_object('distributor_id', _dist_id, 'code', _code, 'commission_rate', _commission_rate));

  RETURN jsonb_build_object('ok', true, 'distributor_id', _dist_id, 'code', _code, 'commission_rate', _commission_rate);
END;
$$;

-- Revoke distributor role
CREATE OR REPLACE FUNCTION admin_revoke_distributor(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _dist RECORD;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  SELECT * INTO _dist FROM public.distributors WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'distributor';
  UPDATE public.distributors SET status = 'inactive' WHERE id = _dist.id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values)
  VALUES (_admin_id, 'DISTRIBUTOR_REVOKED', 'user', _user_id::TEXT,
    jsonb_build_object('distributor_id', _dist.id, 'code', _dist.code));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Update distributor commission rate
CREATE OR REPLACE FUNCTION admin_update_distributor(
  _user_id UUID,
  _commission_rate NUMERIC DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _dist RECORD;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  SELECT * INTO _dist FROM public.distributors WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  UPDATE public.distributors SET
    commission_rate = COALESCE(_commission_rate, commission_rate),
    status = COALESCE(_status, status)
  WHERE id = _dist.id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
  VALUES (_admin_id, 'DISTRIBUTOR_UPDATED', 'user', _user_id::TEXT,
    jsonb_build_object('commission_rate', _dist.commission_rate, 'status', _dist.status),
    jsonb_build_object('commission_rate', COALESCE(_commission_rate, _dist.commission_rate), 'status', COALESCE(_status, _dist.status)));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- List all distributors with stats
CREATE OR REPLACE FUNCTION admin_get_distributors(
  _search TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _offset INTEGER;
  _total INTEGER;
  _result JSONB;
BEGIN
  PERFORM _require_admin();
  _offset := (_page - 1) * _page_size;

  SELECT COUNT(*) INTO _total
  FROM public.distributors d
  JOIN public.user_roles ur ON ur.user_id = d.user_id AND ur.role = 'distributor'
  LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE (_search IS NULL OR _search = '' OR
    p.display_name ILIKE '%' || _search || '%' OR
    p.email ILIKE '%' || _search || '%' OR
    d.code ILIKE '%' || _search || '%'
  )
  AND (_status IS NULL OR _status = '' OR d.status = _status);

  SELECT jsonb_agg(row_to_json(r)) INTO _result
  FROM (
    SELECT
      d.id, d.user_id, d.code, d.commission_rate, d.status, d.created_at,
      p.display_name, p.email, p.phone,
      (SELECT COUNT(*) FROM public.profiles p2 WHERE p2.distributor_id = d.id) AS customer_count,
      (SELECT COUNT(*) FROM public.payments pay WHERE pay.distributor_id = d.id AND pay.status IN ('approved','confirmed')) AS payment_count,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.distributor_id = d.id AND pay.status IN ('approved','confirmed')) AS total_sales,
      (SELECT COALESCE(SUM(pay.commission_amount), 0) FROM public.payments pay WHERE pay.distributor_id = d.id AND pay.status IN ('approved','confirmed')) AS total_commission
    FROM public.distributors d
    JOIN public.user_roles ur ON ur.user_id = d.user_id AND ur.role = 'distributor'
    LEFT JOIN public.profiles p ON p.user_id = d.user_id
    WHERE (_search IS NULL OR _search = '' OR
      p.display_name ILIKE '%' || _search || '%' OR
      p.email ILIKE '%' || _search || '%' OR
      d.code ILIKE '%' || _search || '%'
    )
    AND (_status IS NULL OR _status = '' OR d.status = _status)
    ORDER BY d.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) r;

  RETURN jsonb_build_object('distributors', COALESCE(_result, '[]'::jsonb), 'total', _total, 'page', _page, 'page_size', _page_size);
END;
$$;

-- Get distributor detail with customers
CREATE OR REPLACE FUNCTION admin_get_distributor_detail(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _dist JSONB;
  _customers JSONB;
BEGIN
  PERFORM _require_admin();

  SELECT jsonb_build_object(
    'user_id', d.user_id, 'code', d.code, 'commission_rate', d.commission_rate,
    'status', d.status, 'created_at', d.created_at,
    'display_name', p.display_name, 'email', p.email, 'phone', p.phone,
    'customer_count', (SELECT COUNT(*) FROM public.profiles p2 WHERE p2.distributor_id = d.id),
    'total_sales', (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.distributor_id = d.id AND pay.status IN ('approved','confirmed')),
    'total_commission', (SELECT COALESCE(SUM(pay.commission_amount), 0) FROM public.payments pay WHERE pay.distributor_id = d.id AND pay.status IN ('approved','confirmed'))
  ) INTO _dist
  FROM public.distributors d LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE d.user_id = _user_id;

  IF _dist IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  SELECT jsonb_agg(row_to_json(c)) INTO _customers
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.license_status, p.expiry_date, p.created_at,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.distributor_id = (SELECT id FROM public.distributors WHERE user_id = _user_id) AND pay.status IN ('approved','confirmed')) AS total_payments,
      (SELECT COALESCE(SUM(pay.commission_amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.distributor_id = (SELECT id FROM public.distributors WHERE user_id = _user_id) AND pay.status IN ('approved','confirmed')) AS distributor_commission
    FROM public.profiles p
    WHERE p.distributor_id = (SELECT id FROM public.distributors WHERE user_id = _user_id)
    ORDER BY p.created_at DESC
  ) c;

  RETURN jsonb_build_object('ok', true, 'distributor', _dist, 'customers', COALESCE(_customers, '[]'::jsonb));
END;
$$;

-- Assign customer to distributor (admin)
CREATE OR REPLACE FUNCTION admin_assign_customer_to_distributor(
  _customer_id UUID,
  _distributor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _dist_id UUID;
BEGIN
  PERFORM _require_admin();

  SELECT id INTO _dist_id FROM public.distributors WHERE user_id = _distributor_user_id AND status = 'active';
  IF _dist_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  UPDATE public.profiles SET distributor_id = _dist_id WHERE user_id = _customer_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Remove customer from distributor (admin)
CREATE OR REPLACE FUNCTION admin_remove_customer_from_distributor(_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM _require_admin();
  UPDATE public.profiles SET distributor_id = NULL WHERE user_id = _customer_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── CUSTOMER SELF-LINK ────────────────────────────────────

-- Link to distributor by code (ONE-TIME ONLY)
CREATE OR REPLACE FUNCTION link_to_distributor(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id UUID;
  _dist RECORD;
  _already_linked UUID;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Check if already linked (ONE-TIME ONLY)
  SELECT distributor_id INTO _already_linked FROM public.profiles WHERE user_id = _user_id;
  IF _already_linked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_linked');
  END IF;

  -- Find distributor by code
  SELECT d.id, d.code, d.commission_rate, p.display_name INTO _dist
  FROM public.distributors d
  LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE UPPER(TRIM(d.code)) = UPPER(TRIM(_code)) AND d.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  UPDATE public.profiles SET distributor_id = _dist.id WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'distributor_code', _dist.code,
    'distributor_name', COALESCE(_dist.display_name, 'Distributor'),
    'commission_rate', _dist.commission_rate
  );
END;
$$;

-- Get my distributor info
CREATE OR REPLACE FUNCTION get_my_distributor()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'ok', true, 'linked', true,
    'distributor_code', d.code,
    'distributor_name', COALESCE(p.display_name, 'Distributor'),
    'commission_rate', d.commission_rate
  ) INTO _result
  FROM public.profiles pr
  JOIN public.distributors d ON d.id = pr.distributor_id
  LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE pr.user_id = auth.uid();

  IF _result IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'linked', false);
  END IF;
  RETURN _result;
END;
$$;

-- ─── DISTRIBUTOR PANEL RPCs ────────────────────────────────

-- Distributor: own profile + stats (payments-based)
CREATE OR REPLACE FUNCTION distributor_get_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _dist RECORD;
BEGIN
  SELECT d.id, d.code, d.commission_rate, d.status, p.display_name, p.email, p.phone
  INTO _dist
  FROM public.distributors d LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE d.user_id = auth.uid() AND d.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'distributor', jsonb_build_object(
      'code', _dist.code, 'commission_rate', _dist.commission_rate,
      'display_name', _dist.display_name, 'email', _dist.email, 'phone', _dist.phone
    ),
    'stats', jsonb_build_object(
      'total_customers', (SELECT COUNT(*) FROM public.profiles WHERE distributor_id = _dist.id),
      'active_customers', (SELECT COUNT(*) FROM public.profiles WHERE distributor_id = _dist.id AND license_status = 'active'),
      'total_payments', (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE distributor_id = _dist.id AND status IN ('approved','confirmed')),
      'total_commission', (SELECT COALESCE(SUM(commission_amount), 0) FROM public.payments WHERE distributor_id = _dist.id AND status IN ('approved','confirmed')),
      'today_commission', (SELECT COALESCE(SUM(commission_amount), 0) FROM public.payments WHERE distributor_id = _dist.id AND status IN ('approved','confirmed') AND created_at >= CURRENT_DATE),
      'monthly_commission', (SELECT COALESCE(SUM(commission_amount), 0) FROM public.payments WHERE distributor_id = _dist.id AND status IN ('approved','confirmed') AND created_at >= DATE_TRUNC('month', CURRENT_DATE))
    )
  );
END;
$$;

-- Distributor: own customers
CREATE OR REPLACE FUNCTION distributor_get_customers(
  _search TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _dist_id UUID;
  _offset INTEGER;
  _total INTEGER;
  _result JSONB;
BEGIN
  SELECT d.id INTO _dist_id FROM public.distributors d WHERE d.user_id = auth.uid() AND d.status = 'active';
  IF _dist_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  _offset := (_page - 1) * _page_size;

  SELECT COUNT(*) INTO _total
  FROM public.profiles p
  WHERE p.distributor_id = _dist_id
  AND (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%');

  SELECT jsonb_agg(row_to_json(c)) INTO _result
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.license_status, p.expiry_date, p.created_at, p.last_login,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.distributor_id = _dist_id AND pay.status IN ('approved','confirmed')) AS total_payments,
      (SELECT COALESCE(SUM(pay.commission_amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.distributor_id = _dist_id AND pay.status IN ('approved','confirmed')) AS distributor_commission
    FROM public.profiles p
    WHERE p.distributor_id = _dist_id
    AND (_search IS NULL OR _search = '' OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%')
    ORDER BY p.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) c;

  RETURN jsonb_build_object('customers', COALESCE(_result, '[]'::jsonb), 'total', _total);
END;
$$;

-- Distributor: report (payments-based)
CREATE OR REPLACE FUNCTION distributor_get_report(_period TEXT DEFAULT 'month')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _dist_id UUID;
  _from_date DATE;
  _daily JSONB;
  _customer_ranking JSONB;
BEGIN
  SELECT d.id INTO _dist_id FROM public.distributors d WHERE d.user_id = auth.uid() AND d.status = 'active';
  IF _dist_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  IF _period = 'day' THEN _from_date := CURRENT_DATE;
  ELSIF _period = 'week' THEN _from_date := CURRENT_DATE - INTERVAL '7 days';
  ELSE _from_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;

  SELECT jsonb_agg(row_to_json(d)) INTO _daily
  FROM (
    SELECT pay.created_at::DATE AS day, COUNT(*) AS payment_count,
      COALESCE(SUM(pay.amount), 0) AS total_amount,
      COALESCE(SUM(pay.commission_amount), 0) AS total_commission
    FROM public.payments pay
    WHERE pay.distributor_id = _dist_id AND pay.status IN ('approved','confirmed')
    AND pay.created_at::DATE >= _from_date
    GROUP BY pay.created_at::DATE ORDER BY day DESC
  ) d;

  SELECT jsonb_agg(row_to_json(r)) INTO _customer_ranking
  FROM (
    SELECT pay.user_id, p.display_name,
      COUNT(*) AS payment_count,
      COALESCE(SUM(pay.amount), 0) AS total_amount,
      COALESCE(SUM(pay.commission_amount), 0) AS total_commission
    FROM public.payments pay
    JOIN public.profiles p ON p.user_id = pay.user_id
    WHERE pay.distributor_id = _dist_id AND pay.status IN ('approved','confirmed')
    AND pay.created_at::DATE >= _from_date
    GROUP BY pay.user_id, p.display_name
    ORDER BY total_amount DESC LIMIT 10
  ) r;

  RETURN jsonb_build_object(
    'ok', true, 'period', _period,
    'daily', COALESCE(_daily, '[]'::jsonb),
    'customer_ranking', COALESCE(_customer_ranking, '[]'::jsonb)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. GRANTS
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION link_to_distributor(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_distributor() TO authenticated;

GRANT EXECUTE ON FUNCTION distributor_get_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_customers(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_report(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION admin_grant_distributor(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_revoke_distributor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_distributor(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_distributors(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_distributor_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_assign_customer_to_distributor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_customer_from_distributor(UUID) TO authenticated;
