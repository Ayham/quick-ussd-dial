-- Run this in Supabase SQL Editor
-- Replaces approve-license and reject-license Edge Functions with RPCs

CREATE OR REPLACE FUNCTION public.admin_approve_activation(_request_id UUID, _license_type TEXT DEFAULT 'days_30', _duration_days INTEGER DEFAULT 30, _notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD; v_expiry DATE; v_lic_type TEXT; v_is_permanent BOOLEAN;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed'); END IF;
  v_is_permanent := (_license_type = 'permanent');
  IF v_is_permanent THEN
    v_lic_type := 'permanent'; v_expiry := NULL;
  ELSE
    v_expiry := (now() + (_duration_days || ' days')::INTERVAL)::DATE;
    v_lic_type := CASE WHEN _duration_days <= 30 THEN 'days_30' WHEN _duration_days <= 90 THEN 'days_90' WHEN _duration_days <= 180 THEN 'days_180' ELSE 'days_365' END;
  END IF;
  UPDATE public.activations SET status = 'approved', processed_by = v_admin, processed_at = now(), notes = COALESCE(_notes, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = CASE WHEN v_is_permanent THEN 'permanent' ELSE 'active' END, license_type = v_lic_type, expiry_date = v_expiry, account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'approve_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent, 'notes', _notes));
  RETURN jsonb_build_object('success', true, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_activation(_request_id UUID, _reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed'); END IF;
  UPDATE public.activations SET status = 'rejected', processed_by = v_admin, processed_at = now(), notes = COALESCE(_reason, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = 'rejected', account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'reject_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_reject_activation(UUID, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_reject_activation(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_modify_activation(_request_id UUID, _license_type TEXT DEFAULT 'days_30', _duration_days INTEGER DEFAULT 30, _notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD; v_expiry DATE; v_lic_type TEXT; v_is_permanent BOOLEAN;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found'); END IF;
  v_is_permanent := (_license_type = 'permanent');
  IF v_is_permanent THEN
    v_lic_type := 'permanent'; v_expiry := NULL;
  ELSE
    v_expiry := (now() + (_duration_days || ' days')::INTERVAL)::DATE;
    v_lic_type := CASE WHEN _duration_days <= 30 THEN 'days_30' WHEN _duration_days <= 90 THEN 'days_90' WHEN _duration_days <= 180 THEN 'days_180' ELSE 'days_365' END;
  END IF;
  UPDATE public.activations SET notes = COALESCE(_notes, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = CASE WHEN v_is_permanent THEN 'permanent' ELSE 'active' END, license_type = v_lic_type, expiry_date = v_expiry, account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'modify_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent, 'notes', _notes));
  RETURN jsonb_build_object('success', true, 'license_type', v_lic_type, 'expiry_date', v_expiry, 'permanent', v_is_permanent);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_activation(_request_id UUID, _reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_activation RECORD;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'activation_not_found'); END IF;
  UPDATE public.activations SET notes = COALESCE(_reason, notes) WHERE id = _request_id;
  UPDATE public.profiles SET license_status = 'expired', account_status = 'active', updated_at = now() WHERE user_id = v_activation.user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details) VALUES (v_admin, 'revoke_license', 'user', v_activation.user_id::TEXT, jsonb_build_object('activation_id', _request_id, 'reason', _reason));
  RETURN jsonb_build_object('success', true, 'status', 'revoked');
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_activation(UUID, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_revoke_activation(UUID, TEXT) TO authenticated;
