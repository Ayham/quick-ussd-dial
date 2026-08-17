-- ============================================================
-- DISTRIBUTOR ASSIGNMENT STATUS SYSTEM
-- Migration: 20260818000001
--
-- Three-state assignment model:
--   unassigned      - No distributor, customer can self-link via code
--   assigned        - Linked to a distributor, cannot self-change
--   direct_locked   - Admin marked as direct customer, blocked from linking
-- ============================================================

-- 1. Create enum for assignment status
CREATE TYPE distributor_assignment_status AS ENUM (
  'unassigned',      -- No distributor, customer can self-link
  'assigned',        -- Linked to a distributor
  'direct_locked'    -- Admin locked, blocked from any distributor
);

-- 2. Add assignment_status column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS distributor_assignment_status distributor_assignment_status
  NOT NULL DEFAULT 'unassigned';

-- 3. Backfill existing users based on current distributor_id state
UPDATE public.profiles
SET distributor_assignment_status = CASE
  WHEN distributor_id IS NOT NULL THEN 'assigned'::distributor_assignment_status
  ELSE 'unassigned'::distributor_assignment_status
END
WHERE distributor_assignment_status IS NULL;

-- 4. Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_distributor_assignment_status
  ON public.profiles(distributor_assignment_status);

-- 5. Update trigger to enforce three-state logic
CREATE OR REPLACE FUNCTION enforce_distributor_assignment_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow admin to do anything
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Block customer from changing assignment when locked
  IF NEW.distributor_assignment_status = 'direct_locked'::distributor_assignment_status AND OLD.distributor_assignment_status != 'direct_locked'::distributor_assignment_status THEN
    RAISE EXCEPTION 'Cannot set direct_locked: admin only';
  END IF;

  -- Block customer from removing direct_locked
  IF OLD.distributor_assignment_status = 'direct_locked'::distributor_assignment_status AND NEW.distributor_assignment_status != 'direct_locked'::distributor_assignment_status THEN
    RAISE EXCEPTION 'Cannot remove direct_locked: admin only';
  END IF;

  -- Block customer from changing distributor_id when locked
  IF OLD.distributor_assignment_status = 'direct_locked'::distributor_assignment_status AND NEW.distributor_id IS DISTINCT FROM OLD.distributor_id THEN
    RAISE EXCEPTION 'Direct customer locked: cannot change distributor';
  END IF;

  -- Allow customer to set distributor_id only when unassigned
  IF NEW.distributor_id IS DISTINCT FROM OLD.distributor_id THEN
    IF OLD.distributor_assignment_status != 'unassigned'::distributor_assignment_status THEN
      RAISE EXCEPTION 'Can only link distributor when unassigned';
    END IF;
    -- Auto-set to assigned when linking
    NEW.distributor_assignment_status := 'assigned'::distributor_assignment_status;
  END IF;

  -- Prevent manual status changes by non-admins
  IF NEW.distributor_assignment_status IS DISTINCT FROM OLD.distributor_assignment_status THEN
    RAISE EXCEPTION 'Assignment status can only be changed by admin';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_distributor_assignment ON public.profiles;
CREATE TRIGGER trg_enforce_distributor_assignment
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_distributor_assignment_rules();

-- 6. Update link_to_distributor to respect new rules
CREATE OR REPLACE FUNCTION link_to_distributor(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id UUID;
  _dist RECORD;
  _assignment_status TEXT;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Check current assignment status
  SELECT distributor_assignment_status INTO _assignment_status
  FROM public.profiles WHERE user_id = _user_id;

  IF _assignment_status = 'assigned' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_linked');
  ELSIF _assignment_status = 'direct_locked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'direct_customer_locked');
  END IF;

  -- Find distributor by code
  SELECT d.id, d.code, d.commission_rate, p.display_name INTO _dist
  FROM public.distributors d
  LEFT JOIN public.profiles p ON p.user_id = d.user_id
  WHERE UPPER(TRIM(d.code)) = UPPER(TRIM(_code)) AND d.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found');
  END IF;

  -- Link customer to distributor
  UPDATE public.profiles
  SET distributor_id = _dist.id,
      distributor_assignment_status = 'assigned'
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'distributor_code', _dist.code,
    'distributor_name', COALESCE(_dist.display_name, 'Distributor'),
    'commission_rate', _dist.commission_rate
  );
END;
$$ LANGUAGE plpgsql;

-- 7. Admin: Set customer assignment status (unassigned/assigned/direct_locked)
CREATE OR REPLACE FUNCTION admin_set_customer_assignment_status(
  _customer_id UUID,
  _assignment_status distributor_assignment_status,
  _distributor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _admin_id UUID;
  _dist_id UUID;
  _old_status TEXT;
  _old_distributor_id UUID;
BEGIN
  PERFORM _require_admin();
  _admin_id := auth.uid();

  -- Get current status for audit
  SELECT distributor_assignment_status, distributor_id INTO _old_status, _old_distributor_id
  FROM public.profiles WHERE user_id = _customer_id;

  IF _old_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_not_found');
  END IF;

  -- Validate status transition
  IF _assignment_status = 'assigned' THEN
    IF _distributor_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'distributor_user_id_required_for_assigned');
    END IF;

    SELECT id INTO _dist_id
    FROM public.distributors
    WHERE user_id = _distributor_user_id AND status = 'active';

    IF _dist_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'distributor_not_found_or_inactive');
    END IF;

    UPDATE public.profiles
    SET distributor_id = _dist_id,
        distributor_assignment_status = 'assigned'
    WHERE user_id = _customer_id;

    -- Audit
    INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
    VALUES (_admin_id, 'CUSTOMER_ASSIGNED', 'customer', _customer_id::TEXT,
      jsonb_build_object('assignment_status', _old_status, 'distributor_id', NULL),
      jsonb_build_object('assignment_status', 'assigned', 'distributor_id', _dist_id));
  ELSIF _assignment_status = 'unassigned' THEN
    UPDATE public.profiles
    SET distributor_id = NULL,
        distributor_assignment_status = 'unassigned'
    WHERE user_id = _customer_id;

    -- Audit
    INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
    VALUES (_admin_id, 'CUSTOMER_UNASSIGNED', 'customer', _customer_id::TEXT,
      jsonb_build_object('assignment_status', _old_status, 'distributor_id', _old_distributor_id),
      jsonb_build_object('assignment_status', 'unassigned', 'distributor_id', NULL));
  ELSIF _assignment_status = 'direct_locked' THEN
    UPDATE public.profiles
    SET distributor_id = NULL,
        distributor_assignment_status = 'direct_locked'
    WHERE user_id = _customer_id;

    -- Audit
    INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, old_values, new_values)
    VALUES (_admin_id, 'CUSTOMER_DIRECT_LOCKED', 'customer', _customer_id::TEXT,
      jsonb_build_object('assignment_status', _old_status, 'distributor_id', _old_distributor_id),
      jsonb_build_object('assignment_status', 'direct_locked', 'distributor_id', NULL));
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_assignment_status');
  END IF;

  RETURN jsonb_build_object('ok', true, 'assignment_status', _assignment_status);
END;
$$ LANGUAGE plpgsql;

-- 8. Admin: Get customers with assignment status
CREATE OR REPLACE FUNCTION admin_get_customers_with_assignment(
  _search TEXT DEFAULT NULL,
  _assignment_status distributor_assignment_status DEFAULT NULL,
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
    p.phone ILIKE '%' || _search || '%')
    AND (_assignment_status IS NULL OR p.distributor_assignment_status = _assignment_status)
    AND (_distributor_id IS NULL OR p.distributor_id = _distributor_id);

  SELECT jsonb_agg(row_to_json(c)) INTO _result
  FROM (
    SELECT
      p.user_id, p.display_name, p.email, p.phone, p.shop_name,
      p.license_status, p.license_type, p.expiry_date, p.account_status,
      p.distributor_id, p.distributor_assignment_status, p.created_at, p.last_login,
      d.code AS distributor_code, d.name AS distributor_name,
      d.commission_rate AS distributor_commission_rate,
      (SELECT COUNT(*) FROM public.transfers t WHERE t.user_id = p.user_id) AS transfer_count,
      (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.status IN ('approved','confirmed')) AS total_sales,
      (SELECT COALESCE(SUM(pay.commission_amount), 0) FROM public.payments pay WHERE pay.user_id = p.user_id AND pay.status IN ('approved','confirmed')) AS distributor_commission
    FROM public.profiles p
    LEFT JOIN public.distributors d ON d.id = p.distributor_id
    WHERE (_search IS NULL OR _search = '' OR
      p.display_name ILIKE '%' || _search || '%' OR
      p.email ILIKE '%' || _search || '%' OR
      p.phone ILIKE '%' || _search || '%')
      AND (_assignment_status IS NULL OR p.distributor_assignment_status = _assignment_status)
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
$$ LANGUAGE plpgsql;

-- 9. Update link_to_distributor to also check direct_locked
-- Already handled in step 6

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_set_customer_assignment_status(UUID, distributor_assignment_status, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_customers_with_assignment(TEXT, distributor_assignment_status, UUID, INTEGER, INTEGER) TO authenticated;