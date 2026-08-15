-- ============================================================================
-- SB5 hardening (follow-up to 20260817000003):
--   - fn_trial_abuse_check must not abort on a malformed x-forwarded-for value:
--     an invalid inet cast raised 22P02 and silently disabled the whole trial
--     check. IP is now parsed defensively (NULL on bad input).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_trial_abuse_check(
  p_user_id uuid,
  p_fingerprint text,
  p_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_fp_other uuid;
  v_fp_count bigint;
  v_trial_days integer;
  v_ip inet;
  v_allowed boolean := true;
  v_reason text := NULL;
BEGIN
  -- Defensive IP parse: a garbage proxy header must not take the check down.
  IF p_ip IS NOT NULL AND p_ip <> '' THEN
    BEGIN
      v_ip := p_ip::inet;
    EXCEPTION WHEN invalid_text_representation THEN
      v_ip := NULL;
    END;
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND OR COALESCE(v_prof.license_status, '') <> 'trial' THEN
    INSERT INTO public.trial_signup_log (user_id, device_id, device_fingerprint, ip, allowed, reason, trial_days)
    VALUES (p_user_id, v_prof.current_device, p_fingerprint, v_ip, true, 'not_a_trial', NULL);
    RETURN jsonb_build_object('allowed', true);
  END IF;

  v_trial_days := GREATEST(1, COALESCE(
    (SELECT extract(day FROM (v_prof.trial_end - v_prof.trial_start))::int)
  , 30));

  IF p_fingerprint IS NOT NULL AND p_fingerprint <> '' THEN
    SELECT d.user_id INTO v_fp_other
      FROM public.devices d
     WHERE d.device_fingerprint = p_fingerprint
       AND d.user_id IS DISTINCT FROM p_user_id
     ORDER BY d.updated_at DESC
     LIMIT 1;

    IF v_fp_other IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles
         WHERE user_id = v_fp_other
           AND (license_status = 'trial' OR trial_start IS NOT NULL)
      ) THEN
        v_allowed := false;
        v_reason := 'fingerprint_trial_reuse';
      END IF;
    END IF;
  END IF;

  IF v_allowed AND v_ip IS NOT NULL THEN
    SELECT count(DISTINCT user_id) INTO v_fp_count
      FROM public.trial_signup_log
     WHERE ip = v_ip
       AND created_at > now() - interval '24 hours'
       AND allowed = true;

    IF v_fp_count >= 5 THEN
      v_allowed := false;
      v_reason := 'ip_daily_trial_cap';
    END IF;
  END IF;

  IF NOT v_allowed THEN
    UPDATE public.profiles
       SET license_status = 'pending',
           trial_start    = NULL,
           trial_end      = NULL
     WHERE user_id = p_user_id;
    UPDATE public.devices
       SET lifecycle_state = 'pending_activation', updated_at = now()
     WHERE user_id = p_user_id
       AND lifecycle_state = 'trial';
  END IF;

  INSERT INTO public.trial_signup_log (user_id, device_id, device_fingerprint, ip, allowed, reason, trial_days)
  VALUES (p_user_id, v_prof.current_device, p_fingerprint, v_ip, v_allowed, v_reason, v_trial_days);

  RETURN jsonb_build_object('allowed', v_allowed, 'reason', v_reason);
END;
$$;

-- Grants were set by the original migration; keep them explicit and idempotent.
REVOKE ALL ON FUNCTION public.fn_trial_abuse_check(uuid, text, text) FROM PUBLIC, ANON, AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.fn_trial_abuse_check(uuid, text, text) TO service_role;
