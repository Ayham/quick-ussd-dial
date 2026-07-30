-- Run this in Supabase SQL Editor
-- Replaces the request-activation Edge Function with a database RPC to avoid CORS issues.

CREATE OR REPLACE FUNCTION public.request_activation(_device_id TEXT, _contact_name TEXT DEFAULT NULL, _contact_phone TEXT DEFAULT NULL, _ussd_numbers TEXT[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_token TEXT; _existing RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT id INTO _existing FROM public.activations WHERE user_id = v_uid AND status = 'pending' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'pending_request_exists', 'request_id', _existing.id); END IF;
  v_token := gen_random_uuid()::TEXT;
  INSERT INTO public.activations (request_token, device_id, user_id, contact_name, contact_phone, ussd_numbers, status)
  VALUES (v_token, _device_id, v_uid, _contact_name, _contact_phone, _ussd_numbers, 'pending');
  RETURN jsonb_build_object('success', true, 'request_token', v_token);
END; $$;
REVOKE EXECUTE ON FUNCTION public.request_activation(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.request_activation(TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
