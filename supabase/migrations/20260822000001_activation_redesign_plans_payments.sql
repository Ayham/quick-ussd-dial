-- Activation system redesign: packages, payment methods, renewal support, payment submission

-- 1. payment_methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  details TEXT,
  qr_image_url TEXT,
  whatsapp_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_methods TO authenticated, anon;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_read_all" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "payment_methods_admin_write" ON public.payment_methods FOR ALL 
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Add is_featured to subscription_plans
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- 3. Add activation enhancement columns to activations table
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'activation';
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS payer_phone TEXT;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS payment_note TEXT;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.activations ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 4. Seed default payment methods if empty
INSERT INTO public.payment_methods (title, description, details, whatsapp_number, display_order)
VALUES 
  ('شام كاش (Syriatel Cash)', 'تحويل فوري عبر سيرياتيل كاش', 'رقم الحساب: 0930000000\nاسم الحساب: Quick USSD Dial', '+963930000000', 1),
  ('ام تى ان كاش (MTN Cash)', 'تحويل فوري عبر إم تي إن كاش', 'رقم الحساب: 0940000000\nاسم الحساب: Quick USSD Dial', '+963940000000', 2)
ON CONFLICT DO NOTHING;

-- 5. Updated request_activation RPC with plan and renewal support
CREATE OR REPLACE FUNCTION public.request_activation(
  _device_id TEXT, 
  _plan_id UUID DEFAULT NULL,
  _request_type TEXT DEFAULT 'activation',
  _contact_name TEXT DEFAULT NULL, 
  _contact_phone TEXT DEFAULT NULL, 
  _notes TEXT DEFAULT NULL,
  _ussd_numbers TEXT[] DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  v_uid UUID := auth.uid(); 
  v_token TEXT; 
  _existing RECORD;
BEGIN
  IF v_uid IS NULL THEN 
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); 
  END IF;
  
  -- Check pending or submitted request
  SELECT id, status INTO _existing FROM public.activations 
  WHERE user_id = v_uid AND status IN ('pending', 'payment_submitted') LIMIT 1;
  
  IF FOUND THEN 
    RETURN jsonb_build_object('success', false, 'error', 'pending_request_exists', 'request_id', _existing.id); 
  END IF;

  v_token := gen_random_uuid()::TEXT;
  INSERT INTO public.activations (
    request_token, device_id, user_id, plan_id, request_type, 
    contact_name, contact_phone, notes, ussd_numbers, status, payment_status
  )
  VALUES (
    v_token, _device_id, v_uid, _plan_id, COALESCE(_request_type, 'activation'),
    _contact_name, _contact_phone, _notes, _ussd_numbers, 'pending', 'pending'
  );
  
  RETURN jsonb_build_object('success', true, 'request_token', v_token, 'request_id', (SELECT id FROM public.activations WHERE request_token = v_token));
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_activation(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.request_activation(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- 6. RPC: submit_activation_payment
CREATE OR REPLACE FUNCTION public.submit_activation_payment(
  _request_id UUID,
  _payment_method_id UUID,
  _payer_name TEXT,
  _payer_phone TEXT,
  _payment_note TEXT DEFAULT NULL,
  _transaction_reference TEXT DEFAULT NULL,
  _receipt_url TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  _req RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO _req FROM public.activations WHERE id = _request_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  UPDATE public.activations
  SET 
    payment_method_id = _payment_method_id,
    payer_name = _payer_name,
    payer_phone = _payer_phone,
    payment_note = _payment_note,
    transaction_reference = _transaction_reference,
    receipt_url = _receipt_url,
    payment_status = 'submitted',
    updated_at = now()
  WHERE id = _request_id;

  RETURN jsonb_build_object('success', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_activation_payment(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.submit_activation_payment(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 7. Updated admin_approve_activation supporting plan duration and renewal extension
CREATE OR REPLACE FUNCTION public.admin_approve_activation(
  _request_id UUID,
  _license_type TEXT DEFAULT 'year_1',
  _expiry_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  v_admin UUID; 
  v_activation RECORD; 
  v_plan RECORD;
  v_expiry DATE; 
  v_lic_type TEXT; 
  v_is_lifetime BOOLEAN; 
  v_license_status TEXT;
  v_current_expiry DATE;
  v_duration INT;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed'); 
  END IF;

  IF v_activation.plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_activation.plan_id;
  END IF;

  IF v_plan IS NOT NULL THEN
    v_duration := v_plan.duration_days;
    v_is_lifetime := (v_plan.code = 'lifetime' OR v_duration >= 36500);
    
    IF v_is_lifetime THEN
      v_lic_type := 'lifetime';
      v_expiry := NULL;
      v_license_status := 'permanent';
    ELSE
      v_lic_type := v_plan.code;
      IF v_activation.request_type = 'renewal' THEN
        SELECT expiry_date INTO v_current_expiry FROM public.profiles WHERE user_id = v_activation.user_id;
        IF v_current_expiry IS NOT NULL AND v_current_expiry > CURRENT_DATE THEN
          v_expiry := (v_current_expiry + (v_duration || ' days')::INTERVAL)::DATE;
        ELSE
          v_expiry := (now() + (v_duration || ' days')::INTERVAL)::DATE;
        END IF;
      ELSE
        v_expiry := (now() + (v_duration || ' days')::INTERVAL)::DATE;
      END IF;
      v_license_status := 'active';
    END IF;

    -- Record payment
    INSERT INTO public.payments (user_id, plan_id, device_id, amount, currency, method, reference, status, notes, approved_by, approved_at)
    VALUES (
      v_activation.user_id, 
      v_plan.id, 
      v_activation.device_id, 
      v_plan.price, 
      v_plan.currency, 
      COALESCE(v_activation.payment_status, 'manual'),
      v_activation.transaction_reference,
      'approved',
      COALESCE(_notes, v_activation.payment_note),
      v_admin,
      now()
    );
  ELSE
    v_is_lifetime := (_license_type = 'lifetime');
    IF v_is_lifetime THEN
      v_lic_type := 'lifetime';
      v_expiry := NULL;
      v_license_status := 'permanent';
    ELSE
      v_lic_type := _license_type;
      IF _license_type = 'year_1' THEN
        v_expiry := (now() + INTERVAL '1 year')::DATE;
      ELSIF _license_type = 'year_2' THEN
        v_expiry := (now() + INTERVAL '2 years')::DATE;
      ELSIF _license_type = 'year_3' THEN
        v_expiry := (now() + INTERVAL '3 years')::DATE;
      ELSIF _license_type = 'custom_date' THEN
        v_expiry := _expiry_date;
      ELSE
        v_expiry := (now() + INTERVAL '1 year')::DATE;
        v_lic_type := 'year_1';
      END IF;
      v_license_status := 'active';
    END IF;
  END IF;

  UPDATE public.activations 
  SET status = 'approved', processed_by = v_admin, processed_at = now(), notes = COALESCE(_notes, notes), payment_status = 'approved' 
  WHERE id = _request_id;

  UPDATE public.profiles 
  SET license_status = v_license_status, license_type = v_lic_type, expiry_date = v_expiry, account_status = 'active', updated_at = now() 
  WHERE user_id = v_activation.user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'approve_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'lifetime', v_is_lifetime, 'notes', _notes, 'request_type', v_activation.request_type));

  RETURN jsonb_build_object('success', true, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'lifetime', v_is_lifetime);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, DATE, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, DATE, TEXT) TO authenticated;

-- 8. Updated get_activation_requests RPC returning plan and payment details
CREATE OR REPLACE FUNCTION public.get_activation_requests(_status TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_admin BOOLEAN; _result JSONB;
BEGIN
  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF _is_admin THEN
    SELECT jsonb_agg(sub) INTO _result FROM (
      SELECT 
        a.id, a.request_token, a.user_id, a.status, a.contact_name, a.contact_phone, a.notes, 
        a.created_at, a.processed_at, a.processed_by, a.plan_id, a.request_type, 
        a.payment_method_id, a.payer_name, a.payer_phone, a.payment_note, a.transaction_reference, 
        a.payment_status, a.receipt_url,
        p.display_name, p.email, p.phone AS profile_phone, p.license_status, p.trial_end, p.trial_start,
        sp.name AS plan_name, sp.price AS plan_price, sp.currency AS plan_currency, sp.duration_days AS plan_duration_days,
        pm.title AS payment_method_title
      FROM public.activations a 
      LEFT JOIN public.profiles p ON p.user_id = a.user_id
      LEFT JOIN public.subscription_plans sp ON sp.id = a.plan_id
      LEFT JOIN public.payment_methods pm ON pm.id = a.payment_method_id
      WHERE (_status IS NULL OR a.status::TEXT = _status) ORDER BY a.created_at DESC
    ) sub;
  ELSE
    SELECT jsonb_agg(sub) INTO _result FROM (
      SELECT 
        a.id, a.request_token, a.status, a.notes, a.created_at, a.processed_at, 
        a.plan_id, a.request_type, a.payment_method_id, a.payer_name, a.payer_phone, 
        a.payment_note, a.transaction_reference, a.payment_status, a.receipt_url,
        sp.name AS plan_name, sp.price AS plan_price, sp.currency AS plan_currency,
        pm.title AS payment_method_title
      FROM public.activations a 
      LEFT JOIN public.subscription_plans sp ON sp.id = a.plan_id
      LEFT JOIN public.payment_methods pm ON pm.id = a.payment_method_id
      WHERE a.user_id = auth.uid() AND (_status IS NULL OR a.status::TEXT = _status)
      ORDER BY a.created_at DESC
    ) sub;
  END IF;
  RETURN jsonb_build_object('requests', COALESCE(_result, '[]'::JSONB));
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_activation_requests(TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_activation_requests(TEXT) TO authenticated, service_role;
