-- ============================================================
-- DISTRIBUTOR MANAGEMENT SYSTEM
-- Migration: 20260817000006
-- ============================================================

-- 1. Extend app_role enum with 'distributor'
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'distributor' AFTER 'user';

-- 2. Create distributors table
CREATE TABLE IF NOT EXISTS public.distributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.distributors IS 'Business distributors who manage customer accounts';
COMMENT ON COLUMN public.distributors.code IS 'Unique distributor code (e.g. DST-0001)';
COMMENT ON COLUMN public.distributors.commission_rate IS 'Commission percentage applied to customer transactions';
COMMENT ON COLUMN public.distributors.status IS 'active/inactive/suspended - soft status only';

CREATE INDEX IF NOT EXISTS idx_distributors_code ON public.distributors(code);
CREATE INDEX IF NOT EXISTS idx_distributors_status ON public.distributors(status);
CREATE INDEX IF NOT EXISTS idx_distributors_created_at ON public.distributors(created_at);

-- 3. Add distributor_id to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS distributor_id UUID REFERENCES public.distributors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_distributor_id ON public.profiles(distributor_id) WHERE distributor_id IS NOT NULL;

-- 4. Create distributor_transactions table
CREATE TABLE IF NOT EXISTS public.distributor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('commission', 'payment', 'adjustment', 'credit', 'debit')),
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SYP',
  gross_amount NUMERIC(15,2),
  cost NUMERIC(15,2),
  commission_rate NUMERIC(5,2),
  commission_amount NUMERIC(15,2),
  company_profit NUMERIC(15,2),
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'reversed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.distributor_transactions IS 'Financial transactions for distributor commission tracking';
COMMENT ON COLUMN public.distributor_transactions.commission_rate IS 'Commission rate at time of transaction (immutable)';
COMMENT ON COLUMN public.distributor_transactions.commission_amount IS 'Commission amount calculated at transaction time';

CREATE INDEX IF NOT EXISTS idx_dt_distributor_id ON public.distributor_transactions(distributor_id);
CREATE INDEX IF NOT EXISTS idx_dt_customer_id ON public.distributor_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_dt_created_at ON public.distributor_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_dt_type ON public.distributor_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_dt_status ON public.distributor_transactions(status);

-- 5. Trigger: update updated_at on distributors
CREATE OR REPLACE FUNCTION update_distributors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_distributors_updated ON public.distributors;
CREATE TRIGGER trg_distributors_updated
  BEFORE UPDATE ON public.distributors
  FOR EACH ROW
  EXECUTE FUNCTION update_distributors_updated_at();

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributor_transactions ENABLE ROW LEVEL SECURITY;

-- Distributors table RLS

-- Admin: full access
CREATE POLICY "admin_all_distributors" ON public.distributors
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Distributor: view own record
CREATE POLICY "distributor_select_own" ON public.distributors
  FOR SELECT
  USING (
    id IN (
      SELECT d.id FROM public.distributors d
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
      WHERE ur.role = 'distributor' AND d.id = (
        SELECT p.distributor_id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    )
  );

-- Distributor transactions RLS

-- Admin: full access
CREATE POLICY "admin_all_distributor_transactions" ON public.distributor_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Distributor: view transactions for their own customers
CREATE POLICY "distributor_select_customer_transactions" ON public.distributor_transactions
  FOR SELECT
  USING (
    distributor_id = (
      SELECT p.distributor_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND has_role(auth.uid(), 'distributor')
  );

-- ============================================================
-- RPC FUNCTIONS
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

-- Admin: Create distributor
CREATE OR REPLACE FUNCTION admin_create_distributor(
  _name TEXT,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _company_name TEXT DEFAULT NULL,
  _commission_rate NUMERIC DEFAULT 5.00,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _code TEXT;
  _id UUID;
  _admin_id UUID;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  _code := generate_distributor_code();

  INSERT INTO public.distributors (code, name, email, phone, company_name, commission_rate, notes, created_by)
  VALUES (_code, _name, _email, _phone, _company_name, _commission_rate, _notes, _admin_id)
  RETURNING id INTO _id;

  -- Audit log
  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, new_values)
  VALUES (_admin_id, 'DISTRIBUTOR_CREATED', 'distributor', _id::TEXT,
    jsonb_build_object('code', _code, 'name', _name, 'commission_rate', _commission_rate));

  RETURN jsonb_build_object(
    'ok', true,
    'id', _id,
    'code', _code,
    'name', _name,
    'commission_rate', _commission_rate
  );
END;
$$;

-- Admin: Update distributor
CREATE OR REPLACE FUNCTION admin_update_distributor(
  _distributor_id UUID,
  _name TEXT DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _company_name TEXT DEFAULT NULL,
  _commission_rate NUMERIC DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _old RECORD;
  _new_commission NUMERIC;
  _new_status TEXT;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  SELECT * INTO _old FROM public.distributors WHERE id = _distributor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  _new_commission := COALESCE(_commission_rate, _old.commission_rate);
  _new_status := COALESCE(_status, _old.status);

  UPDATE public.distributors SET
    name = COALESCE(_name, name),
    email = COALESCE(_email, email),
    phone = COALESCE(_phone, phone),
    company_name = COALESCE(_company_name, company_name),
    commission_rate = _new_commission,
    status = _new_status,
    notes = COALESCE(_notes, notes)
  WHERE id = _distributor_id;

  -- Audit log
  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
  VALUES (_admin_id, 'DISTRIBUTOR_UPDATED', 'distributor', _distributor_id::TEXT,
    jsonb_build_object('name', _old.name, 'commission_rate', _old.commission_rate, 'status', _old.status),
    jsonb_build_object('name', _name, 'commission_rate', _new_commission, 'status', _new_status));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Admin: Get all distributors
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
  WHERE (_search IS NULL OR _search = '' OR
    d.name ILIKE '%' || _search || '%' OR
    d.code ILIKE '%' || _search || '%' OR
    d.email ILIKE '%' || _search || '%'
  )
  AND (_status IS NULL OR _status = '' OR d.status = _status);

  SELECT jsonb_agg(row_to_json(d)) INTO _result
  FROM (
    SELECT
      d.id, d.code, d.name, d.email, d.phone, d.company_name,
      d.commission_rate, d.status, d.notes, d.created_at, d.updated_at,
      d.created_by,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = d.id) AS customer_count,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = d.id AND p.license_status = 'active') AS active_customer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.distributor_id = d.id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.distributor_id = d.id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS total_commission
    FROM public.distributors d
    WHERE (_search IS NULL OR _search = '' OR
      d.name ILIKE '%' || _search || '%' OR
      d.code ILIKE '%' || _search || '%' OR
      d.email ILIKE '%' || _search || '%'
    )
    AND (_status IS NULL OR _status = '' OR d.status = _status)
    ORDER BY d.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) d;

  RETURN jsonb_build_object(
    'distributors', COALESCE(_result, '[]'::jsonb),
    'total', _total,
    'page', _page,
    'page_size', _page_size
  );
END;
$$;

-- Admin: Get distributor detail
CREATE OR REPLACE FUNCTION admin_get_distributor_detail(_distributor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _distributor JSONB;
  _customers JSONB;
  _recent_transactions JSONB;
BEGIN
  PERFORM _require_admin();

  SELECT row_to_json(d) INTO _distributor
  FROM (
    SELECT
      dist.id, dist.code, dist.name, dist.email, dist.phone, dist.company_name,
      dist.commission_rate, dist.status, dist.notes, dist.created_at, dist.updated_at,
      dist.created_by,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = dist.id) AS customer_count,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = dist.id AND p.license_status = 'active') AS active_customer_count,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = dist.id AND p.license_status = 'trial') AS trial_customer_count,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.distributor_id = dist.id AND p.license_status IN ('expired', 'inactive', 'revoked')) AS inactive_customer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.distributor_id = dist.id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.distributor_id = dist.id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS total_commission,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.distributor_id = dist.id AND dt.transaction_type = 'payment' AND dt.status = 'completed') AS total_payments
    FROM public.distributors dist
    WHERE dist.id = _distributor_id
  ) d;

  IF _distributor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  -- Get customers
  SELECT jsonb_agg(row_to_json(c)) INTO _customers
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone, p.shop_name,
      p.license_status, p.license_type, p.expiry_date, p.account_status,
      p.created_at, p.last_login,
      (SELECT COUNT(*) FROM public.transfers t WHERE t.user_id = p.user_id) AS transfer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS distributor_profit
    FROM public.profiles p
    WHERE p.distributor_id = _distributor_id
    ORDER BY p.created_at DESC
  ) c;

  -- Get recent transactions
  SELECT jsonb_agg(row_to_json(t)) INTO _recent_transactions
  FROM (
    SELECT
      dt.id, dt.customer_id, dt.transaction_type, dt.amount, dt.currency,
      dt.commission_rate, dt.commission_amount, dt.company_profit,
      dt.status, dt.notes, dt.created_at,
      p.display_name AS customer_name
    FROM public.distributor_transactions dt
    LEFT JOIN public.profiles p ON p.user_id = dt.customer_id
    WHERE dt.distributor_id = _distributor_id
    ORDER BY dt.created_at DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'distributor', _distributor,
    'customers', COALESCE(_customers, '[]'::jsonb),
    'recent_transactions', COALESCE(_recent_transactions, '[]'::jsonb)
  );
END;
$$;

-- Admin: Assign customer to distributor
CREATE OR REPLACE FUNCTION admin_assign_customer_to_distributor(
  _customer_id UUID,
  _distributor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _old_distributor_id UUID;
  _distributor_code TEXT;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  -- Get current distributor assignment
  SELECT p.distributor_id INTO _old_distributor_id
  FROM public.profiles p WHERE p.user_id = _customer_id;

  -- Validate distributor exists
  SELECT d.code INTO _distributor_code
  FROM public.distributors d WHERE d.id = _distributor_id AND d.status = 'active';

  IF _distributor_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  -- Assign
  UPDATE public.profiles SET distributor_id = _distributor_id
  WHERE user_id = _customer_id;

  -- Audit log
  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
  VALUES (_admin_id, 'CUSTOMER_ASSIGNED', 'customer', _customer_id::TEXT,
    jsonb_build_object('distributor_id', _old_distributor_id),
    jsonb_build_object('distributor_id', _distributor_id, 'distributor_code', _distributor_code));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Admin: Remove customer from distributor
CREATE OR REPLACE FUNCTION admin_remove_customer_from_distributor(
  _customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _old_distributor_id UUID;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  SELECT p.distributor_id INTO _old_distributor_id
  FROM public.profiles p WHERE p.user_id = _customer_id;

  UPDATE public.profiles SET distributor_id = NULL
  WHERE user_id = _customer_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
  VALUES (_admin_id, 'CUSTOMER_UNASSIGNED', 'customer', _customer_id::TEXT,
    jsonb_build_object('distributor_id', _old_distributor_id),
    jsonb_build_object('distributor_id', NULL));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Admin: Get all customers with distributor info
CREATE OR REPLACE FUNCTION admin_get_customers_with_distributor(
  _search TEXT DEFAULT NULL,
  _distributor_id UUID DEFAULT NULL,
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
  FROM public.profiles p
  LEFT JOIN public.distributors d ON d.id = p.distributor_id
  WHERE (_search IS NULL OR _search = '' OR
    p.display_name ILIKE '%' || _search || '%' OR
    p.email ILIKE '%' || _search || '%' OR
    p.phone ILIKE '%' || _search || '%'
  )
  AND (_distributor_id IS NULL OR p.distributor_id = _distributor_id);

  SELECT jsonb_agg(row_to_json(c)) INTO _result
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone, p.shop_name,
      p.license_status, p.license_type, p.expiry_date, p.account_status,
      p.distributor_id, p.created_at, p.last_login,
      d.code AS distributor_code, d.name AS distributor_name,
      d.commission_rate AS distributor_commission_rate,
      (SELECT COUNT(*) FROM public.transfers t WHERE t.user_id = p.user_id) AS transfer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS distributor_profit
    FROM public.profiles p
    LEFT JOIN public.distributors d ON d.id = p.distributor_id
    WHERE (_search IS NULL OR _search = '' OR
      p.display_name ILIKE '%' || _search || '%' OR
      p.email ILIKE '%' || _search || '%' OR
      p.phone ILIKE '%' || _search || '%'
    )
    AND (_distributor_id IS NULL OR p.distributor_id = _distributor_id)
    ORDER BY p.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) c;

  RETURN jsonb_build_object(
    'customers', COALESCE(_result, '[]'::jsonb),
    'total', _total,
    'page', _page,
    'page_size', _page_size
  );
END;
$$;

-- Distributor: Get own dashboard summary
CREATE OR REPLACE FUNCTION distributor_get_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _distributor_id UUID;
  _distributor RECORD;
  _total_customers INTEGER;
  _active_customers INTEGER;
  _pending_activations INTEGER;
  _total_sales NUMERIC;
  _total_commission NUMERIC;
  _today_sales NUMERIC;
  _today_commission NUMERIC;
  _monthly_sales NUMERIC;
  _monthly_commission NUMERIC;
BEGIN
  -- Get distributor from the authenticated user's profile
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  SELECT * INTO _distributor
  FROM public.distributors d WHERE d.id = _distributor_id AND d.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_inactive');
  END IF;

  SELECT COUNT(*) INTO _total_customers
  FROM public.profiles p WHERE p.distributor_id = _distributor_id;

  SELECT COUNT(*) INTO _active_customers
  FROM public.profiles p WHERE p.distributor_id = _distributor_id AND p.license_status = 'active';

  SELECT COUNT(*) INTO _pending_activations
  FROM public.activations a
  JOIN public.profiles p ON p.user_id = a.user_id
  WHERE p.distributor_id = _distributor_id AND a.status = 'pending';

  SELECT COALESCE(SUM(dt.amount), 0), COALESCE(SUM(dt.commission_amount), 0)
  INTO _total_sales, _total_commission
  FROM public.distributor_transactions dt
  WHERE dt.distributor_id = _distributor_id AND dt.status = 'completed';

  SELECT COALESCE(SUM(dt.amount), 0), COALESCE(SUM(dt.commission_amount), 0)
  INTO _today_sales, _today_commission
  FROM public.distributor_transactions dt
  WHERE dt.distributor_id = _distributor_id AND dt.status = 'completed'
  AND dt.created_at >= CURRENT_DATE;

  SELECT COALESCE(SUM(dt.amount), 0), COALESCE(SUM(dt.commission_amount), 0)
  INTO _monthly_sales, _monthly_commission
  FROM public.distributor_transactions dt
  WHERE dt.distributor_id = _distributor_id AND dt.status = 'completed'
  AND dt.created_at >= DATE_TRUNC('month', CURRENT_DATE);

  RETURN jsonb_build_object(
    'ok', true,
    'distributor', jsonb_build_object(
      'id', _distributor.id,
      'code', _distributor.code,
      'name', _distributor.name,
      'email', _distributor.email,
      'phone', _distributor.phone,
      'company_name', _distributor.company_name,
      'commission_rate', _distributor.commission_rate,
      'status', _distributor.status
    ),
    'stats', jsonb_build_object(
      'total_customers', _total_customers,
      'active_customers', _active_customers,
      'pending_activations', _pending_activations,
      'total_sales', _total_sales,
      'total_commission', _total_commission,
      'today_sales', _today_sales,
      'today_commission', _today_commission,
      'monthly_sales', _monthly_sales,
      'monthly_commission', _monthly_commission
    )
  );
END;
$$;

-- Distributor: Get own customers
CREATE OR REPLACE FUNCTION distributor_get_customers(
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
  _distributor_id UUID;
  _offset INTEGER;
  _total INTEGER;
  _result JSONB;
BEGIN
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  _offset := (_page - 1) * _page_size;

  SELECT COUNT(*) INTO _total
  FROM public.profiles p
  WHERE p.distributor_id = _distributor_id
  AND (_search IS NULL OR _search = '' OR
    p.display_name ILIKE '%' || _search || '%' OR
    p.email ILIKE '%' || _search || '%' OR
    p.phone ILIKE '%' || _search || '%'
  )
  AND (_status IS NULL OR _status = '' OR p.license_status = _status);

  SELECT jsonb_agg(row_to_json(c)) INTO _result
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone, p.shop_name,
      p.license_status, p.license_type, p.expiry_date, p.account_status,
      p.created_at, p.last_login,
      (SELECT COUNT(*) FROM public.transfers t WHERE t.user_id = p.user_id) AS transfer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS distributor_profit,
      (SELECT a.status FROM public.activations a WHERE a.user_id = p.user_id ORDER BY a.created_at DESC LIMIT 1) AS activation_status
    FROM public.profiles p
    WHERE p.distributor_id = _distributor_id
    AND (_search IS NULL OR _search = '' OR
      p.display_name ILIKE '%' || _search || '%' OR
      p.email ILIKE '%' || _search || '%' OR
      p.phone ILIKE '%' || _search || '%'
    )
    AND (_status IS NULL OR _status = '' OR p.license_status = _status)
    ORDER BY p.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) c;

  RETURN jsonb_build_object(
    'customers', COALESCE(_result, '[]'::jsonb),
    'total', _total,
    'page', _page,
    'page_size', _page_size
  );
END;
$$;

-- Distributor: Get customer detail
CREATE OR REPLACE FUNCTION distributor_get_customer_detail(_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _distributor_id UUID;
  _customer JSONB;
  _transactions JSONB;
  _payments JSONB;
BEGIN
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  -- Verify customer belongs to this distributor
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = _customer_id AND p.distributor_id = _distributor_id;

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_not_yours');
  END IF;

  SELECT row_to_json(c) INTO _customer
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone, p.shop_name, p.address,
      p.license_status, p.license_type, p.expiry_date, p.account_status,
      p.created_at, p.last_login, p.last_sync,
      d.code AS distributor_code, d.commission_rate,
      (SELECT COUNT(*) FROM public.transfers t WHERE t.user_id = p.user_id) AS transfer_count,
      (SELECT COALESCE(SUM(dt.amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.status = 'completed') AS total_sales,
      (SELECT COALESCE(SUM(dt.commission_amount), 0) FROM public.distributor_transactions dt WHERE dt.customer_id = p.user_id AND dt.distributor_id = _distributor_id AND dt.transaction_type = 'commission' AND dt.status = 'completed') AS distributor_profit
    FROM public.profiles p
    LEFT JOIN public.distributors d ON d.id = p.distributor_id
    WHERE p.user_id = _customer_id AND p.distributor_id = _distributor_id
  ) c;

  IF _customer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_not_found');
  END IF;

  -- Get transactions
  SELECT jsonb_agg(row_to_json(t)) INTO _transactions
  FROM (
    SELECT
      dt.id, dt.transaction_type, dt.amount, dt.currency,
      dt.commission_rate, dt.commission_amount, dt.company_profit,
      dt.status, dt.notes, dt.created_at
    FROM public.distributor_transactions dt
    WHERE dt.customer_id = _customer_id AND dt.distributor_id = _distributor_id
    ORDER BY dt.created_at DESC
    LIMIT 50
  ) t;

  -- Get payments
  SELECT jsonb_agg(row_to_json(py)) INTO _payments
  FROM (
    SELECT
      py.id, py.amount, py.currency, py.method, py.status,
      py.payment_for, py.payment_date, py.created_at
    FROM public.payments py
    WHERE py.user_id = _customer_id
    ORDER BY py.created_at DESC
    LIMIT 50
  ) py;

  RETURN jsonb_build_object(
    'ok', true,
    'customer', _customer,
    'transactions', COALESCE(_transactions, '[]'::jsonb),
    'payments', COALESCE(_payments, '[]'::jsonb)
  );
END;
$$;

-- Distributor: Get own transactions
CREATE OR REPLACE FUNCTION distributor_get_transactions(
  _search TEXT DEFAULT NULL,
  _type TEXT DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _distributor_id UUID;
  _offset INTEGER;
  _total INTEGER;
  _result JSONB;
BEGIN
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  _offset := (_page - 1) * _page_size;

  SELECT COUNT(*) INTO _total
  FROM public.distributor_transactions dt
  LEFT JOIN public.profiles p ON p.user_id = dt.customer_id
  WHERE dt.distributor_id = _distributor_id
  AND (_search IS NULL OR _search = '' OR
    p.display_name ILIKE '%' || _search || '%' OR
    p.email ILIKE '%' || _search || '%'
  )
  AND (_type IS NULL OR _type = '' OR dt.transaction_type = _type);

  SELECT jsonb_agg(row_to_json(t)) INTO _result
  FROM (
    SELECT
      dt.id, dt.customer_id, dt.transaction_type, dt.amount, dt.currency,
      dt.gross_amount, dt.cost, dt.commission_rate, dt.commission_amount,
      dt.company_profit, dt.status, dt.notes, dt.created_at,
      p.display_name AS customer_name, p.email AS customer_email
    FROM public.distributor_transactions dt
    LEFT JOIN public.profiles p ON p.user_id = dt.customer_id
    WHERE dt.distributor_id = _distributor_id
    AND (_search IS NULL OR _search = '' OR
      p.display_name ILIKE '%' || _search || '%' OR
      p.email ILIKE '%' || _search || '%'
    )
    AND (_type IS NULL OR _type = '' OR dt.transaction_type = _type)
    ORDER BY dt.created_at DESC
    LIMIT _page_size OFFSET _offset
  ) t;

  RETURN jsonb_build_object(
    'transactions', COALESCE(_result, '[]'::jsonb),
    'total', _total,
    'page', _page,
    'page_size', _page_size
  );
END;
$$;

-- Distributor: Get own report summary
CREATE OR REPLACE FUNCTION distributor_get_report(
  _period TEXT DEFAULT 'month',
  _date_from DATE DEFAULT NULL,
  _date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _distributor_id UUID;
  _from_date DATE;
  _to_date DATE;
  _daily JSONB;
  _by_operator JSONB;
  _customer_ranking JSONB;
BEGIN
  SELECT p.distributor_id INTO _distributor_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _distributor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_distributor');
  END IF;

  -- Date range
  IF _date_from IS NOT NULL THEN
    _from_date := _date_from;
  ELSIF _period = 'day' THEN
    _from_date := CURRENT_DATE;
  ELSIF _period = 'week' THEN
    _from_date := CURRENT_DATE - INTERVAL '7 days';
  ELSE
    _from_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;

  _to_date := COALESCE(_date_to, CURRENT_DATE);

  -- Daily breakdown
  SELECT jsonb_agg(row_to_json(d)) INTO _daily
  FROM (
    SELECT
      dt.created_at::DATE AS day,
      COUNT(*) AS transaction_count,
      COALESCE(SUM(dt.amount), 0) AS total_amount,
      COALESCE(SUM(dt.commission_amount), 0) AS total_commission,
      COALESCE(SUM(dt.company_profit), 0) AS total_company_profit
    FROM public.distributor_transactions dt
    WHERE dt.distributor_id = _distributor_id
    AND dt.status = 'completed'
    AND dt.created_at::DATE BETWEEN _from_date AND _to_date
    GROUP BY dt.created_at::DATE
    ORDER BY day DESC
  ) d;

  -- Customer ranking by sales
  SELECT jsonb_agg(row_to_json(r)) INTO _customer_ranking
  FROM (
    SELECT
      p.user_id, p.display_name,
      COUNT(dt.id) AS transaction_count,
      COALESCE(SUM(dt.amount), 0) AS total_sales,
      COALESCE(SUM(dt.commission_amount), 0) AS total_commission
    FROM public.distributor_transactions dt
    JOIN public.profiles p ON p.user_id = dt.customer_id
    WHERE dt.distributor_id = _distributor_id
    AND dt.status = 'completed'
    AND dt.created_at::DATE BETWEEN _from_date AND _to_date
    GROUP BY p.user_id, p.display_name
    ORDER BY total_sales DESC
    LIMIT 10
  ) r;

  RETURN jsonb_build_object(
    'ok', true,
    'period', _period,
    'date_from', _from_date,
    'date_to', _to_date,
    'daily', COALESCE(_daily, '[]'::jsonb),
    'customer_ranking', COALESCE(_customer_ranking, '[]'::jsonb)
  );
END;
$$;

-- Admin: Get distributor profit report
CREATE OR REPLACE FUNCTION admin_get_distributor_report(
  _distributor_id UUID,
  _date_from DATE DEFAULT NULL,
  _date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _from_date DATE;
  _to_date DATE;
  _summary JSONB;
  _daily JSONB;
BEGIN
  PERFORM _require_admin();

  _from_date := COALESCE(_date_from, CURRENT_DATE - INTERVAL '30 days');
  _to_date := COALESCE(_date_to, CURRENT_DATE);

  SELECT jsonb_build_object(
    'total_sales', COALESCE(SUM(dt.amount), 0),
    'total_commission', COALESCE(SUM(dt.commission_amount), 0),
    'total_company_profit', COALESCE(SUM(dt.company_profit), 0),
    'transaction_count', COUNT(*)
  ) INTO _summary
  FROM public.distributor_transactions dt
  WHERE dt.distributor_id = _distributor_id
  AND dt.status = 'completed'
  AND dt.created_at::DATE BETWEEN _from_date AND _to_date;

  SELECT jsonb_agg(row_to_json(d)) INTO _daily
  FROM (
    SELECT
      dt.created_at::DATE AS day,
      COALESCE(SUM(dt.amount), 0) AS total_amount,
      COALESCE(SUM(dt.commission_amount), 0) AS total_commission,
      COALESCE(SUM(dt.company_profit), 0) AS total_company_profit,
      COUNT(*) AS transaction_count
    FROM public.distributor_transactions dt
    WHERE dt.distributor_id = _distributor_id
    AND dt.status = 'completed'
    AND dt.created_at::DATE BETWEEN _from_date AND _to_date
    GROUP BY dt.created_at::DATE
    ORDER BY day DESC
  ) d;

  RETURN jsonb_build_object(
    'ok', true,
    'summary', _summary,
    'daily', COALESCE(_daily, '[]'::jsonb),
    'date_from', _from_date,
    'date_to', _to_date
  );
END;
$$;

-- Grant EXECUTE to authenticated users for distributor functions
GRANT EXECUTE ON FUNCTION distributor_get_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_customers(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_customer_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_transactions(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION distributor_get_report(TEXT, DATE, DATE) TO authenticated;

-- Grant EXECUTE to authenticated users for admin distributor functions
GRANT EXECUTE ON FUNCTION admin_create_distributor(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_distributor(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_distributors(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_distributor_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_assign_customer_to_distributor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_customer_from_distributor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_customers_with_distributor(TEXT, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_distributor_report(UUID, DATE, DATE) TO authenticated;
