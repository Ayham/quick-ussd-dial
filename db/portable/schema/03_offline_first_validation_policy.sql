-- =============================================================================
-- 03_offline_first_validation_policy.sql
-- Server-controlled offline validation policy.
--
-- Apply order: 00 → 01 → 02 → 03.
--
-- The SERVER decides how often the client must validate, the offline validity
-- derived from the ACTUAL expiration date, when validation is force-required,
-- and whether a license is revoked/expiring. The client NEVER hardcodes any of
-- these values and NEVER extends a license beyond its server-provided
-- expiration date.
--
-- Business policy:
--   • Expiration is strict and locally enforceable. The actual expiry_date /
--     trial_end is the authoritative offline boundary — no artificial grace.
--   • Revocation / blocking is server-authoritative and takes effect as soon
--     as the device reconnects and revalidates.
--   • offline_grace_ms mirrors remaining offline validity (0 when blocked /
--     expired, remaining time until the real expiration otherwise). It is NOT
--     a competing expiration mechanism.
--
-- Contents:
--   1. Reconcile license/profile columns referenced by the portable edge
--      functions (no-op on databases where they already exist).
--   2. get_validation_policy() — SECURITY DEFINER RPC returning the policy
--      JSONB for the calling user.
--   3. ensure_license_expiration_reminders() — deduplicated, user-scoped
--      expiration reminders built on the existing notification system.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Reconcile license/profile columns used by portable edge functions
--    (validate-license, validate-session, device-login, approve-license,
--     reject-license, reports, ...). All are ADD COLUMN IF NOT EXISTS so this
--    is a no-op on production where the columns already exist.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS license_status text,
  ADD COLUMN IF NOT EXISTS license_type text,
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_device text,
  ADD COLUMN IF NOT EXISTS last_login timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync timestamptz;

-- ---------------------------------------------------------------------------
-- 1b. Reminder-window configuration seed
-- ---------------------------------------------------------------------------
INSERT INTO public.system_config (key, value, description) VALUES
  ('expiration_policy', '{"remind_days_license":7,"remind_days_trial":3}'::jsonb,
   'Expiration reminder windows in days (paid license / trial)')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. get_validation_policy() — server-authoritative validation policy.
--
-- Rules (all server-side, not client-side):
--   • normal:            validate every 24h
--   • expiring_soon:     within 45 days of expiration → validate every 6h
--   • expiring_soon:     within 7 days of expiration → validate every 1h
--   • force_validation:  set when the account is suspended/blocked, the
--                        license is blocked/revoked/rejected, or the actual
--                        expiration date has been reached
--   • offline_grace_ms:  0 when blocked/expired; remaining time until the real
--                        expiration for active/trial; effectively indefinite
--                        for permanent; fallback refresh bound for undated
--                        malformed/legacy profiles
--
-- The client reads this via supabase.rpc("get_validation_policy") after every
-- successful device validation and uses the returned cadence. The client
-- enforces the actual expiration date as the authoritative offline boundary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_validation_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_expiry timestamptz;
  v_offline_grace_ms bigint;
  v_interval_hours int;
  v_policy text := 'normal';
  v_force boolean := false;
  v_now timestamptz := now();
  v_remind_license int;
  v_remind_trial int;
  v_expiration_policy jsonb;
BEGIN
  SELECT p.* INTO v_profile
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

  SELECT COALESCE(value, '{}'::jsonb) INTO v_expiration_policy
    FROM public.system_config WHERE key = 'expiration_policy';
  v_remind_license := COALESCE((v_expiration_policy->>'remind_days_license')::int, 7);
  v_remind_trial   := COALESCE((v_expiration_policy->>'remind_days_trial')::int, 3);

  IF v_profile.account_status IN ('suspended', 'blocked')
     OR v_profile.license_status IN ('blocked', 'revoked', 'rejected', 'expired', 'pending', 'inactive')
     OR (v_expiry IS NOT NULL AND v_expiry <= v_now) THEN
    v_offline_grace_ms := 0;
  ELSIF v_profile.license_status = 'permanent' THEN
    v_offline_grace_ms := 3650 * 86400000;
  ELSIF v_expiry IS NULL THEN
    v_offline_grace_ms := 7 * 86400000;
  ELSE
    v_offline_grace_ms := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_expiry - v_now)) * 1000))::bigint;
  END IF;

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
$$;

REVOKE ALL ON FUNCTION public.get_validation_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. ensure_license_expiration_reminders() — deduplicated expiration reminders
--    based on the actual license/trial expiration date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_license_expiration_reminders(
  p_remind_days_license integer DEFAULT NULL,
  p_remind_days_trial integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_boundary timestamptz;
  v_days_left int;
  v_remind_days int;
  v_reminder_key text;
  v_cfg jsonb;
  v_title_ar text;
  v_title_en text;
  v_body_ar text;
  v_body_en text;
  v_id uuid;
  v_existing int;
  v_is_trial boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;

  SELECT COALESCE(value, '{}'::jsonb) INTO v_cfg
    FROM public.system_config WHERE key = 'expiration_policy';
  IF p_remind_days_license IS NULL THEN
    p_remind_days_license := COALESCE((v_cfg->>'remind_days_license')::int, 7);
  END IF;
  IF p_remind_days_trial IS NULL THEN
    p_remind_days_trial := COALESCE((v_cfg->>'remind_days_trial')::int, 3);
  END IF;

  IF v_profile.license_status = 'trial' AND v_profile.trial_end IS NOT NULL THEN
    v_boundary := v_profile.trial_end;
    v_is_trial := true;
    v_remind_days := p_remind_days_trial;
  ELSIF v_profile.license_status = 'active' AND v_profile.expiry_date IS NOT NULL THEN
    v_boundary := (v_profile.expiry_date::timestamptz + INTERVAL '1 day' - INTERVAL '1 microsecond');
    v_remind_days := p_remind_days_license;
  ELSE
    RETURN jsonb_build_object('ok', true, 'reason', 'no_active_boundary');
  END IF;

  IF v_boundary <= now() THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_expired');
  END IF;

  v_days_left := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_boundary - now())) / 86400))::int;
  IF v_days_left > v_remind_days THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'too_early');
  END IF;

  v_reminder_key := 'exp:' || v_uid::text || ':' || to_char(v_boundary, 'YYYY-MM-DD');

  SELECT count(*) INTO v_existing
    FROM public.notifications n
   WHERE n.notification_type = 'license_expiring'
     AND n.metadata->>'reminder_key' = v_reminder_key
     AND NOT n.is_deleted;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_reminded');
  END IF;

  IF v_is_trial THEN
    v_title_ar := 'اقتراب نهاية الفترة التجريبية';
    v_title_en := 'Trial period ending soon';
    v_body_ar := 'تنتهي الفترة التجريبية بتاريخ ' || to_char(v_boundary, 'YYYY-MM-DD')
                 || ' (' || v_days_left || ' يوم متبقي).';
    v_body_en := 'Your trial period ends on ' || to_char(v_boundary, 'YYYY-MM-DD')
                 || ' (' || v_days_left || ' day(s) left).';
  ELSE
    v_title_ar := 'اقتراب انتهاء الترخيص';
    v_title_en := 'License expiring soon';
    v_body_ar := 'ينتهي الترخيص بتاريخ ' || to_char(v_boundary, 'YYYY-MM-DD')
                 || ' (' || v_days_left || ' يوم متبقي).';
    v_body_en := 'Your license expires on ' || to_char(v_boundary, 'YYYY-MM-DD')
                 || ' (' || v_days_left || ' day(s) left).';
  END IF;

  INSERT INTO public.notifications (
    title_ar, title_en, body_ar, body_en, notification_type, priority,
    action_type, status, sent_at, is_announcement, metadata, version, send_config
  ) VALUES (
    v_title_ar, v_title_en, v_body_ar, v_body_en,
    'license_expiring'::public.notification_type, 'normal'::public.notification_priority,
    'none'::public.notification_action_type, 'sent'::public.notification_status, now(), false,
    jsonb_build_object(
      'reminder_key', v_reminder_key,
      'days_left', v_days_left,
      'boundary', to_char(v_boundary, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'license_status', v_profile.license_status,
      'kind', CASE WHEN v_is_trial THEN 'trial' ELSE 'license' END
    ),
    1, jsonb_build_object('audience', 'single', 'user_id', v_uid)
  ) RETURNING id INTO v_id;

  INSERT INTO public.notification_recipients (notification_id, user_id, status, delivered_at, delivered_version)
  VALUES (v_id, v_uid, 'delivered'::public.notification_recipient_status, now(), 1);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'days_left', v_days_left, 'dedupe_key', v_reminder_key);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_license_expiration_reminders(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_license_expiration_reminders(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_license_expiration_reminders(integer, integer) TO service_role;

COMMIT;

-- =============================================================================
-- Post-apply sanity check (run manually):
-- SELECT public.get_validation_policy();
-- =============================================================================
