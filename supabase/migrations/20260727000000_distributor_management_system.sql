-- ============================================================
-- DISTRIBUTOR MANAGEMENT SYSTEM
-- Migration: 20260727000000
-- Safe, idempotent, backward-compatible
-- ============================================================

-- 1. Extend app_role enum to include 'distributor'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'distributor'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'distributor' AFTER 'user';
  END IF;
END
$$;

-- 2. Extend profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'distributor', 'admin')),
  ADD COLUMN IF NOT EXISTS distributor_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS customer_status TEXT NOT NULL DEFAULT 'active'
    CHECK (customer_status IN ('active', 'blocked', 'archived'));

-- 3. Create distributor_customers table
CREATE TABLE IF NOT EXISTS public.distributor_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID,
  notes TEXT,
  UNIQUE (customer_id)
);

-- 4. Create customer_accounts table (accounting ledger state)
CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  current_debt NUMERIC NOT NULL DEFAULT 0,
  total_topups NUMERIC NOT NULL DEFAULT 0,
  total_payments NUMERIC NOT NULL DEFAULT 0,
  total_adjustments NUMERIC NOT NULL DEFAULT 0,
  last_topup TIMESTAMPTZ,
  last_payment TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create customer_transactions table (permanent accounting ledger)
CREATE TABLE IF NOT EXISTS public.customer_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  distributor_id UUID,
  type TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'adjustment', 'debt', 'credit')),
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  debt_before NUMERIC NOT NULL DEFAULT 0,
  debt_after NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create topup_requests table
CREATE TABLE IF NOT EXISTS public.topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  distributor_id UUID,
  operator TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  notes TEXT,
  distributor_notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Update user_roles to allow distributor role
-- (The enum already allows it after step 1)

-- ============================================================
-- INDEXES
-- ============================================================

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_distributor_id ON public.profiles(distributor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_customer_status ON public.profiles(customer_status);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON public.profiles(created_by);

-- distributor_customers
CREATE INDEX IF NOT EXISTS idx_dc_distributor ON public.distributor_customers(distributor_id);
CREATE INDEX IF NOT EXISTS idx_dc_customer ON public.distributor_customers(customer_id);

-- customer_accounts
CREATE INDEX IF NOT EXISTS idx_ca_customer ON public.customer_accounts(customer_id);

-- customer_transactions
CREATE INDEX IF NOT EXISTS idx_ct_customer ON public.customer_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_distributor ON public.customer_transactions(distributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_type ON public.customer_transactions(type);
CREATE INDEX IF NOT EXISTS idx_ct_created ON public.customer_transactions(created_at DESC);

-- topup_requests
CREATE INDEX IF NOT EXISTS idx_tr_customer ON public.topup_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_tr_distributor ON public.topup_requests(distributor_id, status);
CREATE INDEX IF NOT EXISTS idx_tr_status ON public.topup_requests(status);
CREATE INDEX IF NOT EXISTS idx_tr_created ON public.topup_requests(created_at DESC);

-- ============================================================
-- TRIGGERS (updated_at)
-- ============================================================

-- customer_accounts updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_accounts_updated_at'
  ) THEN
    CREATE TRIGGER trg_customer_accounts_updated_at
      BEFORE UPDATE ON public.customer_accounts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- topup_requests completed_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_topup_requests_completed_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_topup_request_completed_at()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = now();
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE TRIGGER trg_topup_requests_completed_at
      BEFORE UPDATE OF status ON public.topup_requests
      FOR EACH ROW EXECUTE FUNCTION public.set_topup_request_completed_at();
  END IF;
END
$$;

-- ============================================================
-- HELPER: get_current_user_role()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_profile_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(role, 'customer') FROM public.profiles WHERE user_id = p_user_id;
$$;

-- ============================================================
-- HELPER: get_distributor_id_for_user()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_distributor_id_for_user(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.distributors WHERE user_id = p_user_id LIMIT 1;
$$;

-- ============================================================
-- RPC: distributor_add_debt
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_add_debt(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_debt_before NUMERIC;
  v_balance_before NUMERIC;
  v_debt_after NUMERIC;
BEGIN
  -- Verify caller is admin or distributor
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get distributor_id
  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    -- Verify customer belongs to this distributor
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  ELSE
    -- Admin: get distributor from the assignment
    SELECT dc.distributor_id INTO v_distributor_id
    FROM public.distributor_customers dc WHERE dc.customer_id = p_customer_id;
  END IF;

  -- Get current state
  SELECT current_debt, current_balance INTO v_debt_before, v_balance_before
  FROM public.customer_accounts WHERE customer_id = p_customer_id;

  IF NOT FOUND THEN
    INSERT INTO public.customer_accounts (customer_id, current_debt, current_balance)
    VALUES (p_customer_id, 0, 0);
    v_debt_before := 0;
    v_balance_before := 0;
  END IF;

  v_debt_after := v_debt_before + p_amount;

  -- Record transaction
  INSERT INTO public.customer_transactions (
    customer_id, distributor_id, type, amount,
    balance_before, balance_after, debt_before, debt_after,
    notes, created_by
  ) VALUES (
    p_customer_id, v_distributor_id, 'debt', p_amount,
    v_balance_before, v_balance_before, v_debt_before, v_debt_after,
    p_notes, auth.uid()
  );

  -- Update account
  INSERT INTO public.customer_accounts (customer_id, current_debt)
  VALUES (p_customer_id, v_debt_after)
  ON CONFLICT (customer_id) DO UPDATE SET current_debt = v_debt_after;

  RETURN jsonb_build_object('ok', true, 'debt_before', v_debt_before, 'debt_after', v_debt_after);
END;
$$;

-- ============================================================
-- RPC: distributor_register_payment
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_register_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_debt_before NUMERIC;
  v_balance_before NUMERIC;
  v_debt_after NUMERIC;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  ELSE
    SELECT dc.distributor_id INTO v_distributor_id
    FROM public.distributor_customers dc WHERE dc.customer_id = p_customer_id;
  END IF;

  SELECT current_debt, current_balance INTO v_debt_before, v_balance_before
  FROM public.customer_accounts WHERE customer_id = p_customer_id;

  IF NOT FOUND THEN
    INSERT INTO public.customer_accounts (customer_id) VALUES (p_customer_id);
    v_debt_before := 0;
    v_balance_before := 0;
  END IF;

  v_debt_after := GREATEST(v_debt_before - p_amount, 0);

  INSERT INTO public.customer_transactions (
    customer_id, distributor_id, type, amount,
    balance_before, balance_after, debt_before, debt_after,
    notes, created_by
  ) VALUES (
    p_customer_id, v_distributor_id, 'payment', p_amount,
    v_balance_before, v_balance_before, v_debt_before, v_debt_after,
    p_notes, auth.uid()
  );

  UPDATE public.customer_accounts
  SET current_debt = v_debt_after,
      total_payments = total_payments + p_amount,
      last_payment = now()
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object('ok', true, 'debt_before', v_debt_before, 'debt_after', v_debt_after);
END;
$$;

-- ============================================================
-- RPC: distributor_adjust_credit
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_adjust_credit(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
  v_debt_before NUMERIC;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  ELSE
    SELECT dc.distributor_id INTO v_distributor_id
    FROM public.distributor_customers dc WHERE dc.customer_id = p_customer_id;
  END IF;

  SELECT current_balance, current_debt INTO v_balance_before, v_debt_before
  FROM public.customer_accounts WHERE customer_id = p_customer_id;

  IF NOT FOUND THEN
    INSERT INTO public.customer_accounts (customer_id) VALUES (p_customer_id);
    v_balance_before := 0;
    v_debt_before := 0;
  END IF;

  v_balance_after := v_balance_before + p_amount;

  INSERT INTO public.customer_transactions (
    customer_id, distributor_id, type, amount,
    balance_before, balance_after, debt_before, debt_after,
    notes, created_by
  ) VALUES (
    p_customer_id, v_distributor_id, 'adjustment', p_amount,
    v_balance_before, v_balance_after, v_debt_before, v_debt_before,
    p_notes, auth.uid()
  );

  UPDATE public.customer_accounts
  SET current_balance = v_balance_after,
      total_adjustments = total_adjustments + p_amount
  WHERE customer_id = p_customer_id;

  RETURN jsonb_build_object('ok', true, 'balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;

-- ============================================================
-- RPC: distributor_complete_topup
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_complete_topup(
  p_request_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_profile_role TEXT;
  v_distributor_id UUID;
  v_balance_before NUMERIC;
  v_debt_before NUMERIC;
  v_balance_after NUMERIC;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_request FROM public.topup_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status != 'pending' AND v_request.status != 'processing' THEN
    RAISE EXCEPTION 'Request is not in a processable state';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF v_request.distributor_id != v_distributor_id THEN
      RAISE EXCEPTION 'Request not assigned to this distributor';
    END IF;
  ELSE
    v_distributor_id := v_request.distributor_id;
  END IF;

  -- Get current state
  SELECT current_balance, current_debt INTO v_balance_before, v_debt_before
  FROM public.customer_accounts WHERE customer_id = v_request.customer_id;

  IF NOT FOUND THEN
    INSERT INTO public.customer_accounts (customer_id) VALUES (v_request.customer_id);
    v_balance_before := 0;
    v_debt_before := 0;
  END IF;

  v_balance_after := v_balance_before + v_request.amount;

  -- Record transaction
  INSERT INTO public.customer_transactions (
    customer_id, distributor_id, type, amount,
    balance_before, balance_after, debt_before, debt_after,
    notes, created_by
  ) VALUES (
    v_request.customer_id, v_distributor_id, 'topup', v_request.amount,
    v_balance_before, v_balance_after, v_debt_before, v_debt_before,
    COALESCE(p_notes, 'Topup completed'), auth.uid()
  );

  -- Update account
  UPDATE public.customer_accounts
  SET current_balance = v_balance_after,
      total_topups = total_topups + v_request.amount,
      last_topup = now()
  WHERE customer_id = v_request.customer_id;

  -- Update request status
  UPDATE public.topup_requests
  SET status = 'completed',
      completed_by = auth.uid(),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    auth.uid(), 'topup_completed', 'topup_request', p_request_id::TEXT,
    jsonb_build_object('customer_id', v_request.customer_id, 'amount', v_request.amount)
  );

  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance_after);
END;
$$;

-- ============================================================
-- RPC: distributor_move_customer
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_move_customer(
  p_customer_id UUID,
  p_new_distributor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_role TEXT;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can move customers';
  END IF;

  -- Update distributor_customers
  INSERT INTO public.distributor_customers (distributor_id, customer_id, assigned_by)
  VALUES (p_new_distributor_id, p_customer_id, auth.uid())
  ON CONFLICT (customer_id) DO UPDATE
  SET distributor_id = p_new_distributor_id,
      assigned_by = auth.uid(),
      assigned_at = now();

  -- Update profile
  UPDATE public.profiles
  SET distributor_id = p_new_distributor_id
  WHERE user_id = p_customer_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    auth.uid(), 'customer_moved', 'customer', p_customer_id::TEXT,
    jsonb_build_object('new_distributor_id', p_new_distributor_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- RPC: distributor_assign_customer
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_assign_customer(
  p_customer_id UUID,
  p_distributor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_role TEXT;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can assign customers';
  END IF;

  -- Insert assignment
  INSERT INTO public.distributor_customers (distributor_id, customer_id, assigned_by)
  VALUES (p_distributor_id, p_customer_id, auth.uid())
  ON CONFLICT (customer_id) DO UPDATE
  SET distributor_id = p_distributor_id,
      assigned_by = auth.uid(),
      assigned_at = now();

  -- Update profile
  UPDATE public.profiles
  SET distributor_id = p_distributor_id
  WHERE user_id = p_customer_id;

  -- Create customer account if not exists
  INSERT INTO public.customer_accounts (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT DO NOTHING;

  -- Audit
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    auth.uid(), 'customer_assigned', 'customer', p_customer_id::TEXT,
    jsonb_build_object('distributor_id', p_distributor_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- RPC: distributor_dashboard_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_total_customers INTEGER;
  v_total_debt NUMERIC;
  v_total_balance NUMERIC;
  v_pending_requests INTEGER;
  v_today_transactions INTEGER;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
  ELSE
    -- Admin: return overall stats
    SELECT COUNT(*) INTO v_total_customers FROM public.profiles WHERE role = 'customer';
    SELECT COALESCE(SUM(ca.current_debt), 0) INTO v_total_debt FROM public.customer_accounts ca;
    SELECT COALESCE(SUM(ca.current_balance), 0) INTO v_total_balance FROM public.customer_accounts ca;
    SELECT COUNT(*) INTO v_pending_requests FROM public.topup_requests WHERE status = 'pending';
    SELECT COUNT(*) INTO v_today_transactions FROM public.customer_transactions
      WHERE created_at >= CURRENT_DATE;

    RETURN jsonb_build_object(
      'total_customers', v_total_customers,
      'total_debt', v_total_debt,
      'total_balance', v_total_balance,
      'pending_requests', v_pending_requests,
      'today_transactions', v_today_transactions
    );
  END IF;

  -- Distributor-specific stats
  SELECT COUNT(*) INTO v_total_customers
  FROM public.distributor_customers WHERE distributor_id = v_distributor_id;

  SELECT COALESCE(SUM(ca.current_debt), 0), COALESCE(SUM(ca.current_balance), 0)
  INTO v_total_debt, v_total_balance
  FROM public.customer_accounts ca
  INNER JOIN public.distributor_customers dc ON dc.customer_id = ca.customer_id
  WHERE dc.distributor_id = v_distributor_id;

  SELECT COUNT(*) INTO v_pending_requests
  FROM public.topup_requests
  WHERE distributor_id = v_distributor_id AND status = 'pending';

  SELECT COUNT(*) INTO v_today_transactions
  FROM public.customer_transactions
  WHERE distributor_id = v_distributor_id AND created_at >= CURRENT_DATE;

  RETURN jsonb_build_object(
    'total_customers', v_total_customers,
    'total_debt', v_total_debt,
    'total_balance', v_total_balance,
    'pending_requests', v_pending_requests,
    'today_transactions', v_today_transactions
  );
END;
$$;

-- ============================================================
-- RPC: distributor_customers_list
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_customers_list(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_search TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_offset INTEGER;
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Count
  IF v_profile_role = 'admin' THEN
    SELECT COUNT(*) INTO v_total
    FROM public.profiles p
    WHERE p.role = 'customer'
      AND (p_search IS NULL OR p_search = '' OR
           p.display_name ILIKE '%' || p_search || '%' OR
           p.email ILIKE '%' || p_search || '%' OR
           p.phone ILIKE '%' || p_search || '%');
  ELSE
    SELECT COUNT(*) INTO v_total
    FROM public.profiles p
    INNER JOIN public.distributor_customers dc ON dc.customer_id = p.user_id
    WHERE dc.distributor_id = v_distributor_id
      AND (p_search IS NULL OR p_search = '' OR
           p.display_name ILIKE '%' || p_search || '%' OR
           p.email ILIKE '%' || p_search || '%' OR
           p.phone ILIKE '%' || p_search || '%');
  END IF;

  -- Fetch
  IF v_profile_role = 'admin' THEN
    SELECT jsonb_agg(row_to_json(t)) INTO v_rows
    FROM (
      SELECT p.user_id, p.display_name, p.email, p.phone, p.customer_status, p.created_at,
             dc.distributor_id, dc.assigned_at,
             COALESCE(ca.current_balance, 0) as current_balance,
             COALESCE(ca.current_debt, 0) as current_debt,
             dc.assigned_by
      FROM public.profiles p
      LEFT JOIN public.distributor_customers dc ON dc.customer_id = p.user_id
      LEFT JOIN public.customer_accounts ca ON ca.customer_id = p.user_id
      WHERE p.role = 'customer'
        AND (p_search IS NULL OR p_search = '' OR
             p.display_name ILIKE '%' || p_search || '%' OR
             p.email ILIKE '%' || p_search || '%' OR
             p.phone ILIKE '%' || p_search || '%')
      ORDER BY
        CASE WHEN p_sort_by = 'display_name' AND p_sort_dir = 'asc' THEN p.display_name END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'display_name' AND p_sort_dir != 'asc' THEN p.display_name END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'current_debt' AND p_sort_dir = 'asc' THEN ca.current_debt END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'current_debt' AND p_sort_dir != 'asc' THEN ca.current_debt END DESC NULLS LAST,
        p.created_at DESC
      LIMIT p_page_size OFFSET v_offset
    ) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t)) INTO v_rows
    FROM (
      SELECT p.user_id, p.display_name, p.email, p.phone, p.customer_status, p.created_at,
             dc.distributor_id, dc.assigned_at, dc.assigned_by,
             COALESCE(ca.current_balance, 0) as current_balance,
             COALESCE(ca.current_debt, 0) as current_debt
      FROM public.profiles p
      INNER JOIN public.distributor_customers dc ON dc.customer_id = p.user_id
      LEFT JOIN public.customer_accounts ca ON ca.customer_id = p.user_id
      WHERE dc.distributor_id = v_distributor_id
        AND (p_search IS NULL OR p_search = '' OR
             p.display_name ILIKE '%' || p_search || '%' OR
             p.email ILIKE '%' || p_search || '%' OR
             p.phone ILIKE '%' || p_search || '%')
      ORDER BY
        CASE WHEN p_sort_by = 'display_name' AND p_sort_dir = 'asc' THEN p.display_name END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'display_name' AND p_sort_dir != 'asc' THEN p.display_name END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'current_debt' AND p_sort_dir = 'asc' THEN ca.current_debt END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'current_debt' AND p_sort_dir != 'asc' THEN ca.current_debt END DESC NULLS LAST,
        p.created_at DESC
      LIMIT p_page_size OFFSET v_offset
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', CEIL(v_total::NUMERIC / p_page_size)
  );
END;
$$;

-- ============================================================
-- RPC: distributor_customer_detail
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_customer_detail(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_result JSONB;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', p.user_id, 'display_name', p.display_name,
      'email', p.email, 'phone', p.phone, 'language', p.language,
      'customer_status', p.customer_status, 'notes', p.notes,
      'created_at', p.created_at
    ),
    'account', jsonb_build_object(
      'current_balance', COALESCE(ca.current_balance, 0),
      'current_debt', COALESCE(ca.current_debt, 0),
      'total_topups', COALESCE(ca.total_topups, 0),
      'total_payments', COALESCE(ca.total_payments, 0),
      'last_topup', ca.last_topup,
      'last_payment', ca.last_payment
    ),
    'distributor', jsonb_build_object(
      'id', dc.distributor_id,
      'assigned_at', dc.assigned_at,
      'assigned_by', dc.assigned_by,
      'notes', dc.notes
    )
  ) INTO v_result
  FROM public.profiles p
  LEFT JOIN public.customer_accounts ca ON ca.customer_id = p.user_id
  LEFT JOIN public.distributor_customers dc ON dc.customer_id = p.user_id
  WHERE p.user_id = p_customer_id;

  RETURN v_result;
END;
$$;

-- ============================================================
-- RPC: distributor_customer_transactions
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_customer_transactions(
  p_customer_id UUID,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_offset INTEGER;
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM public.customer_transactions WHERE customer_id = p_customer_id;

  SELECT jsonb_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT ct.id, ct.type, ct.amount, ct.balance_before, ct.balance_after,
           ct.debt_before, ct.debt_after, ct.notes, ct.created_at,
           ct.created_by,
           COALESCE(p2.display_name, 'System') as created_by_name
    FROM public.customer_transactions ct
    LEFT JOIN public.profiles p2 ON p2.user_id = ct.created_by
    WHERE ct.customer_id = p_customer_id
    ORDER BY ct.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

-- ============================================================
-- RPC: distributor_topup_requests
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_topup_requests(
  p_status TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
  v_offset INTEGER;
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  IF v_profile_role = 'admin' THEN
    SELECT COUNT(*) INTO v_total
    FROM public.topup_requests tr
    WHERE (p_status IS NULL OR p_status = '' OR tr.status = p_status);
  ELSE
    SELECT COUNT(*) INTO v_total
    FROM public.topup_requests tr
    WHERE tr.distributor_id = v_distributor_id
      AND (p_status IS NULL OR p_status = '' OR tr.status = p_status);
  END IF;

  IF v_profile_role = 'admin' THEN
    SELECT jsonb_agg(row_to_json(t)) INTO v_rows
    FROM (
      SELECT tr.id, tr.customer_id, tr.distributor_id, tr.operator, tr.amount,
             tr.status, tr.notes, tr.distributor_notes, tr.created_at,
             tr.completed_at, tr.completed_by,
             COALESCE(p.display_name, p2.email, 'Unknown') as customer_name,
             COALESCE(p.email, '') as customer_email,
             COALESCE(p3.display_name, '') as distributor_name
      FROM public.topup_requests tr
      LEFT JOIN public.profiles p ON p.user_id = tr.customer_id
      LEFT JOIN public.profiles p2 ON p2.user_id = tr.customer_id
      LEFT JOIN public.distributors d ON d.id = tr.distributor_id
      LEFT JOIN public.profiles p3 ON p3.user_id = d.user_id
      WHERE (p_status IS NULL OR p_status = '' OR tr.status = p_status)
      ORDER BY tr.created_at DESC
      LIMIT p_page_size OFFSET v_offset
    ) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t)) INTO v_rows
    FROM (
      SELECT tr.id, tr.customer_id, tr.distributor_id, tr.operator, tr.amount,
             tr.status, tr.notes, tr.distributor_notes, tr.created_at,
             tr.completed_at, tr.completed_by,
             COALESCE(p.display_name, p2.email, 'Unknown') as customer_name,
             COALESCE(p.email, '') as customer_email
      FROM public.topup_requests tr
      LEFT JOIN public.profiles p ON p.user_id = tr.customer_id
      LEFT JOIN public.profiles p2 ON p2.user_id = tr.customer_id
      WHERE tr.distributor_id = v_distributor_id
        AND (p_status IS NULL OR p_status = '' OR tr.status = p_status)
      ORDER BY tr.created_at DESC
      LIMIT p_page_size OFFSET v_offset
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

-- ============================================================
-- RPC: create_topup_request (customer)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_topup_request(
  p_operator TEXT,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_distributor_id UUID;
  v_request_id UUID;
BEGIN
  v_customer_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_customer_id AND role = 'customer') THEN
    RAISE EXCEPTION 'Only customers can create topup requests';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT distributor_id INTO v_distributor_id
  FROM public.distributor_customers WHERE customer_id = v_customer_id;

  INSERT INTO public.topup_requests (customer_id, distributor_id, operator, amount, notes)
  VALUES (v_customer_id, v_distributor_id, p_operator, p_amount, p_notes)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

-- ============================================================
-- RPC: get_my_topup_requests (customer)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_topup_requests(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_offset INTEGER;
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  v_customer_id := auth.uid();
  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM public.topup_requests WHERE customer_id = v_customer_id;

  SELECT jsonb_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT id, operator, amount, status, notes, distributor_notes,
           created_at, completed_at
    FROM public.topup_requests
    WHERE customer_id = v_customer_id
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

-- ============================================================
-- RPC: admin_list_distributors
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_distributors(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_role TEXT;
  v_offset INTEGER;
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can list distributors';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM public.profiles p
  WHERE p.role = 'distributor'
    AND (p_search IS NULL OR p_search = '' OR
         p.display_name ILIKE '%' || p_search || '%' OR
         p.email ILIKE '%' || p_search || '%' OR
         p.phone ILIKE '%' || p_search || '%');

  SELECT jsonb_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT p.user_id, p.display_name, p.email, p.phone,
           p.customer_status, p.created_at, p.notes,
           (SELECT COUNT(*) FROM public.distributor_customers dc WHERE dc.distributor_id = p.user_id) as customer_count,
           COALESCE((SELECT SUM(ca.current_debt) FROM public.customer_accounts ca
                     INNER JOIN public.distributor_customers dc ON dc.customer_id = ca.customer_id
                     WHERE dc.distributor_id = p.user_id), 0) as total_debt,
           COALESCE((SELECT SUM(ca.current_balance) FROM public.customer_accounts ca
                     INNER JOIN public.distributor_customers dc ON dc.customer_id = ca.customer_id
                     WHERE dc.distributor_id = p.user_id), 0) as total_balance,
           (SELECT COUNT(*) FROM public.topup_requests tr
            WHERE tr.distributor_id = p.user_id AND tr.status = 'pending') as pending_requests
      FROM public.profiles p
      WHERE p.role = 'distributor'
        AND (p_search IS NULL OR p_search = '' OR
             p.display_name ILIKE '%' || p_search || '%' OR
             p.email ILIKE '%' || p_search || '%' OR
             p.phone ILIKE '%' || p_search || '%')
      ORDER BY p.created_at DESC
      LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

-- ============================================================
-- RPC: admin_update_customer_status
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_customer_status(
  p_customer_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_role TEXT;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can update customer status';
  END IF;

  UPDATE public.profiles
  SET customer_status = p_status
  WHERE user_id = p_customer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- RPC: admin_update_customer_notes
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_customer_notes(
  p_customer_id UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_role TEXT;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role != 'admin' THEN
    RAISE EXCEPTION 'Only admin can update customer notes';
  END IF;

  UPDATE public.profiles SET notes = p_notes WHERE user_id = p_customer_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- RPC: distributor_update_customer_notes
-- ============================================================

CREATE OR REPLACE FUNCTION public.distributor_update_customer_notes(
  p_customer_id UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_distributor_id UUID;
  v_profile_role TEXT;
BEGIN
  v_profile_role := public.get_profile_role(auth.uid());
  IF v_profile_role NOT IN ('admin', 'distributor') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_profile_role = 'distributor' THEN
    v_distributor_id := public.get_distributor_id_for_user(auth.uid());
    IF NOT EXISTS (
      SELECT 1 FROM public.distributor_customers
      WHERE customer_id = p_customer_id AND distributor_id = v_distributor_id
    ) THEN
      RAISE EXCEPTION 'Customer not assigned to this distributor';
    END IF;
  END IF;

  UPDATE public.profiles SET notes = p_notes WHERE user_id = p_customer_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- REVOKE EXECUTE from authenticated for all new RPCs
-- They must be called through the admin-rpc edge function
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.distributor_add_debt FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_register_payment FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_adjust_credit FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_complete_topup FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_move_customer FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_assign_customer FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_dashboard_stats FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_customers_list FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_customer_detail FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_customer_transactions FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_topup_requests FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_topup_request FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_topup_requests FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_distributors FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_customer_status FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_customer_notes FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.distributor_update_customer_notes FROM authenticated;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- distributor_customers
ALTER TABLE public.distributor_customers ENABLE ROW LEVEL SECURITY;

-- Admin can see all
DROP POLICY IF EXISTS "dc_admin_all" ON public.distributor_customers;
CREATE POLICY "dc_admin_all" ON public.distributor_customers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Distributor can see their own assignments
DROP POLICY IF EXISTS "dc_distributor_select" ON public.distributor_customers;
CREATE POLICY "dc_distributor_select" ON public.distributor_customers
  FOR SELECT TO authenticated
  USING (
    distributor_id = (
      SELECT id FROM public.distributors WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Customer can see their own assignment
DROP POLICY IF EXISTS "dc_customer_select" ON public.distributor_customers;
CREATE POLICY "dc_customer_select" ON public.distributor_customers
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- customer_accounts
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_admin_all" ON public.customer_accounts;
CREATE POLICY "ca_admin_all" ON public.customer_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "ca_distributor_select" ON public.customer_accounts;
CREATE POLICY "ca_distributor_select" ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT dc.customer_id FROM public.distributor_customers dc
      WHERE dc.distributor_id = (
        SELECT id FROM public.distributors WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

DROP POLICY IF EXISTS "ca_customer_select" ON public.customer_accounts;
CREATE POLICY "ca_customer_select" ON public.customer_accounts
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- customer_transactions
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ct_admin_all" ON public.customer_transactions;
CREATE POLICY "ct_admin_all" ON public.customer_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "ct_distributor_select" ON public.customer_transactions;
CREATE POLICY "ct_distributor_select" ON public.customer_transactions
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT dc.customer_id FROM public.distributor_customers dc
      WHERE dc.distributor_id = (
        SELECT id FROM public.distributors WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

DROP POLICY IF EXISTS "ct_customer_select" ON public.customer_transactions;
CREATE POLICY "ct_customer_select" ON public.customer_transactions
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- topup_requests
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tr_admin_all" ON public.topup_requests;
CREATE POLICY "tr_admin_all" ON public.topup_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "tr_distributor_select" ON public.topup_requests;
CREATE POLICY "tr_distributor_select" ON public.topup_requests
  FOR SELECT TO authenticated
  USING (
    distributor_id = (
      SELECT id FROM public.distributors WHERE user_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "tr_customer_select" ON public.topup_requests;
CREATE POLICY "tr_customer_select" ON public.topup_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "tr_customer_insert" ON public.topup_requests;
CREATE POLICY "tr_customer_insert" ON public.topup_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- ============================================================
-- Backfill: Set existing admin users' profile role to 'admin'
-- ============================================================

UPDATE public.profiles
SET role = 'admin'
WHERE user_id IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
) AND role = 'customer';
