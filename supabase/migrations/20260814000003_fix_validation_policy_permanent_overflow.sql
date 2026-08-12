-- ============================================================================
-- 20260814000003_fix_validation_policy_permanent_overflow.sql
--
-- BUG: get_validation_policy crashed for EVERY permanent user with
--   "integer out of range" (SQLSTATE 22003)
-- because `3650 * 86400000` is evaluated as int4 multiplication BEFORE the
-- assignment to the bigint variable v_offline_grace_ms. 315,360,000,000 exceeds
-- int4 max (2,147,483,647), so any call for a license_status='permanent'
-- profile raised an error.
--
-- IMPACT: the client's refreshValidationPolicy() caught the error and kept the
-- STALE cached policy, and getValidationReminder() kept reading old
-- expiry_date/trial_end values from the last validated verdict -> a permanent
-- user could still see "رخصة التطبيق تقترب من الانتهاء" (license expiring
-- soon) with a perfectly valid permanent license.
--
-- FIX: force bigint arithmetic: 3650::bigint * 86400000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_validation_policy()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile record;
  v_expiry timestamptz;
  v_remaining_ms bigint;
  v_offline_grace_ms bigint;
  v_interval_hours int;
  v_policy text := 'normal';
  v_force boolean := false;
  v_now timestamptz := now();
  v_remind_license int;
  v_remind_trial int;
  v_expiration_policy jsonb;
BEGIN
  SELECT * INTO v_profile
    FROM public.profiles p
   WHERE p.user_id = auth.uid();

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_profile');
  END IF;

  -- Actual expiration boundary (authoritative).
  IF v_profile.license_status = 'trial' AND v_profile.trial_end IS NOT NULL THEN
    v_expiry := v_profile.trial_end;
  ELSIF v_profile.license_status <> 'trial' AND v_profile.expiry_date IS NOT NULL THEN
    v_expiry := v_profile.expiry_date::timestamptz;
  END IF;

  -- Reminder windows (server-controlled, overridable via system_config).
  SELECT COALESCE(value, '{}'::jsonb) INTO v_expiration_policy
    FROM public.system_config WHERE key = 'expiration_policy';
  v_remind_license := COALESCE((v_expiration_policy->>'remind_days_license')::int, 7);
  v_remind_trial   := COALESCE((v_expiration_policy->>'remind_days_trial')::int, 3);

  -- Offline validity derived from the real expiration.
  IF v_profile.account_status IN ('suspended', 'blocked')
     OR v_profile.license_status IN ('blocked', 'revoked', 'rejected', 'expired', 'pending', 'inactive')
     OR (v_expiry IS NOT NULL AND v_expiry <= v_now) THEN
    v_offline_grace_ms := 0;
  ELSIF v_profile.license_status = 'permanent' THEN
    v_offline_grace_ms := 3650::bigint * 86400000; -- valid per permanent status
  ELSIF v_expiry IS NULL THEN
    v_offline_grace_ms := 7 * 86400000;    -- undated (malformed/legacy) fallback
  ELSE
    v_offline_grace_ms := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_expiry - v_now)) * 1000))::bigint;
  END IF;

  -- Validation cadence tightens as the real expiration approaches.
  IF v_expiry IS NULL OR v_expiry - v_now >= INTERVAL '45 days' THEN
    v_interval_hours := 24;
  ELSIF v_expiry - v_now >= INTERVAL '7 days' THEN
    v_interval_hours := 6;
    v_policy := 'expiring_soon';
  ELSE
    v_interval_hours := 1;
    v_policy := 'expiring_soon';
  END IF;
  IF v_profile.license_status = 'permanent' THEN
    v_policy := 'normal';
  END IF;

  IF v_profile.account_status IN ('suspended', 'blocked')
     OR v_profile.license_status IN ('blocked', 'revoked', 'rejected')
     OR (v_expiry IS NOT NULL AND v_expiry <= v_now) THEN
    v_force := true;
    v_policy := 'force';
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'minimum_validation_interval_ms', (v_interval_hours * 3600000)::bigint,
    'offline_grace_ms', v_offline_grace_ms,
    'next_required_validation', to_char(
      v_now + make_interval(hours => v_interval_hours),
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'force_validation', v_force,
    'license_expiration', CASE WHEN v_expiry IS NULL THEN NULL
        ELSE to_char(v_expiry, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'revoked', (v_profile.license_status = 'revoked'),
    'validation_policy', v_policy,
    'remind_days_license', v_remind_license,
    'remind_days_trial', v_remind_trial
  );
END;
$function$;
