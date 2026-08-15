-- ============================================================================
-- SB5: trial anti-abuse — device-fingerprint reuse + per-IP daily cap.
--
-- Attack: a user installs the app, gets a 30-day trial, and keeps getting
-- fresh trials by deleting the app / clearing storage / re-signing-up, because
-- nothing server-side ties a trial to the physical device.
--
-- Fix (server-side, enforced at device-login — cannot be bypassed by a
-- reinstall):
--   1. Fingerprint reuse: if the device fingerprint is already bound to a
--      DIFFERENT user who is on (or ever started) a trial, the new trial is
--      denied.
--   2. Per-IP cap: at most 5 trial signups per IP per rolling 24h window
--      (mobile-NAT caveat: this is a soft cap and keys off distinct users).
--
-- On denial the profile is demoted to license_status = 'pending' with the
-- trial dates cleared (user must be activated by an admin to continue) and the
-- event is recorded in trial_signup_log.
--
-- Called only by the device-login edge function (service_role).
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Audit/decision log for every trial signup attempt.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_signup_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text,
  device_fingerprint text,
  ip inet,
  allowed boolean NOT NULL,
  reason text,
  trial_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_signup_log ENABLE ROW LEVEL SECURITY;
-- No user-facing policy: only service_role reads/writes via the function below.
-- (Default deny covers all roles.)

CREATE INDEX IF NOT EXISTS idx_trial_signup_log_user    ON public.trial_signup_log (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trial_signup_log_ip      ON public.trial_signup_log (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_trial_signup_log_fp      ON public.trial_signup_log (device_fingerprint, created_at);

-- -----------------------------------------------------------------------------
-- Core enforcement function (SECURITY DEFINER, service_role only).
-- Returns { allowed: true } or { allowed: false, reason }.
-- -----------------------------------------------------------------------------
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
  v_ip inet := NULLIF(p_ip, '')::inet;
  v_allowed boolean := true;
  v_reason text := NULL;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND OR COALESCE(v_prof.license_status, '') <> 'trial' THEN
    -- Not a trial account -> nothing to police.
    INSERT INTO public.trial_signup_log (user_id, device_id, device_fingerprint, ip, allowed, reason, trial_days)
    VALUES (p_user_id, v_prof.current_device, p_fingerprint, v_ip, true, 'not_a_trial', NULL);
    RETURN jsonb_build_object('allowed', true);
  END IF;

  v_trial_days := GREATEST(1, COALESCE(
    (SELECT extract(day FROM (v_prof.trial_end - v_prof.trial_start))::int)
  , 30));

  -- 1) Fingerprint already bound to a different trial user?
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

  -- 2) Per-IP daily cap (soft; mobile NAT shares IPs).
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
    -- Demote: pending => requires manual admin activation to proceed.
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

-- Reachable only by the device-login edge function (service_role).
REVOKE ALL ON FUNCTION public.fn_trial_abuse_check(uuid, text, text) FROM PUBLIC, ANON, AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.fn_trial_abuse_check(uuid, text, text) TO service_role;
