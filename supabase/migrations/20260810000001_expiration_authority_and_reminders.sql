-- ============================================================================
-- 20260810000001_expiration_authority_and_reminders.sql
--
-- BUSINESS POLICY
--   • Offline mode provides continuity, not license extension.
--   • Expiration is strict and locally enforceable (actual expiry_date /
--     trial_end is the authoritative offline boundary — no artificial grace).
--   • Revocation / blocking is server-authoritative and takes effect as soon
--     as the device reconnects and revalidates.
--   • Expired licenses lose transfer capability, not application access.
--
-- CONTENTS
--   1. get_validation_policy() — offline_grace_ms is DERIVED from the actual
--      expiration date (0 for blocked/expired, remaining time for active/trial,
--      effectively indefinite for permanent). Never a flat grace period that
--      extends a license. Also returns the reminder windows.
--   2. ensure_license_expiration_reminders() — deduplicated, user-scoped
--      expiration/trial reminders built on the existing notification system.
--   3. validate_device_session() — records last_sync (last server validation)
--      for admin visibility.
--   4. admin_get_all_users_license() — date-aware 'expiring_soon' / 'expired'
--      filters for the admin license management UI.
--   5. system_config seed: expiration_policy reminder windows.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5. SEED reminder-window configuration
-- ---------------------------------------------------------------------------
INSERT INTO public.system_config (key, value, description) VALUES
  ('expiration_policy', '{"remind_days_license":7,"remind_days_trial":3}'::jsonb,
   'Expiration reminder windows in days (paid license / trial)')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. get_validation_policy()
-- ---------------------------------------------------------------------------
-- offline_grace_ms is NOT a competing expiration mechanism. It mirrors the
-- actual remaining offline validity derived from the real expiration date:
--   • suspended/blocked/revoked/rejected/expired/pending/inactive → 0
--   • active / trial → remaining time until expiry_date / trial_end
--   • permanent → effectively indefinite
--   • undated non-permanent (malformed/legacy) → fallback refresh bound
-- The client enforces the expiration date as the authoritative offline
-- boundary and never extends the license beyond it.
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
$$;

REVOKE ALL ON FUNCTION public.get_validation_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_validation_policy() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. ensure_license_expiration_reminders()
-- ---------------------------------------------------------------------------
-- User-scoped, deduplicated reminder generation built on the existing
-- notification system (notifications + notification_recipients). Called by the
-- client after every successful server validation. Deduplicates both locally
-- (client) and here (metadata reminder_key) so a user never receives duplicate
-- reminders for the same boundary. Never extends the license.
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

  -- Reminder is based on the ACTUAL expiration boundary only.
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

-- ---------------------------------------------------------------------------
-- 3. validate_device_session() — record last_sync (last server validation).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
  _result JSONB;
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'profile_not_found',
      'error', 'لم يتم العثور على الملف الشخصي / Profile not found'
    );
  END IF;

  IF _profile.account_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_suspended',
      'error', 'الحساب موقوف / Account suspended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.account_status = 'blocked' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_blocked',
      'error', 'الحساب محظور / Account blocked',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_' || _profile.license_status,
      'error', CASE _profile.license_status
        WHEN 'expired' THEN 'انتهت صلاحية الترخيص / License expired'
        WHEN 'rejected' THEN 'تم رفض التفعيل / Activation rejected'
        WHEN 'blocked' THEN 'الترخيص محظور / License blocked'
        WHEN 'revoked' THEN 'تم إلغاء الترخيص / License revoked'
        WHEN 'pending' THEN 'الترخيص قيد المراجعة / License pending review'
        WHEN 'inactive' THEN 'الترخيص غير مفعل / License inactive'
        ELSE 'الترخيص غير صالح / Invalid license'
      END,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'trial_expired',
      'error', 'انتهت الفترة التجريبية / Trial period ended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'trial_end', _profile.trial_end
    );
  END IF;

  IF _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND _profile.expiry_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_expired',
      'error', 'انتهت صلاحية الترخيص / License expired',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'expiry_date', _profile.expiry_date
    );
  END IF;

  IF _profile.current_device IS NOT NULL AND _profile.current_device != _device_id THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'device_mismatch',
      'error', 'هذا الحساب مسجل على جهاز آخر / This account is registered on another device',
      'current_device', _profile.current_device,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  -- Record the last successful server validation for admin visibility.
  UPDATE public.profiles SET last_sync = _now WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'valid', true, 'reason', 'ok',
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name,
    'license_status', _profile.license_status, 'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date, 'current_device', _profile.current_device,
    'account_status', _profile.account_status,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true
      WHEN _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN true ELSE false END
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_device_session FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.validate_device_session TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. admin_get_all_users_license() — date-aware 'expiring_soon' / 'expired'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_users_license(_search text DEFAULT NULL::text, _status text DEFAULT NULL::text, _page integer DEFAULT 1, _page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _offset INTEGER := (_page - 1) * _page_size; _total BIGINT; _users JSONB;
BEGIN
  PERFORM public._require_admin();
  INSERT INTO public.profiles (user_id, email, display_name, trial_start, trial_end, license_status, license_type, account_status)
  SELECT au.id, au.email, COALESCE(au.raw_user_meta_data->>'full_name', au.email), COALESCE(au.created_at, now()), COALESCE(au.created_at, now()) + INTERVAL '15 days', 'trial', 'trial', 'active'
  FROM auth.users au WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = au.id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT count(*) INTO _total FROM public.profiles;
  SELECT jsonb_agg(sub) INTO _users FROM (
    SELECT p.user_id, p.display_name, p.email, p.phone, p.language, p.created_at, p.updated_at,
      p.trial_start, p.trial_end, p.license_status, p.license_type, p.expiry_date,
      p.current_device, p.last_login, p.last_sync, p.account_status, p.role,
      p.notes, p.customer_status, p.shop_name, p.city, p.address, p.commission_type,
      p.commission_value, p.commission_min, p.commission_max, p.credit_limit,
      p.emergency_phone, p.service_type, p.full_name, p.avatar_url,
      au.email_confirmed_at, au.phone_confirmed_at, au.last_sign_in_at, au.banned_until,
      CASE WHEN p.license_status = 'trial' AND p.trial_end IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM p.trial_end - now())::INTEGER) ELSE NULL END AS trial_remaining_days,
      COALESCE(a.status, p.license_status) AS activation_status,
      a.processed_at AS activation_processed_at,
      a.processed_by AS activation_processed_by
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.user_id
    LEFT JOIN (
      SELECT DISTINCT ON (user_id) id, user_id, status, processed_at, processed_by
      FROM public.activations
      WHERE user_id IS NOT NULL
      ORDER BY user_id, created_at DESC
    ) a ON a.user_id = p.user_id
    WHERE (_search IS NULL OR p.display_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%' OR p.shop_name ILIKE '%' || _search || '%' OR p.city ILIKE '%' || _search || '%')
      AND (
        _status IS NULL
        OR _status = ''
        OR (
          _status = 'expiring_soon' AND (
            (p.license_status IN ('active', 'permanent') AND p.expiry_date IS NOT NULL
             AND p.expiry_date >= CURRENT_DATE
             AND p.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')::date)
            OR (p.license_status = 'trial' AND p.trial_end IS NOT NULL
             AND p.trial_end >= now()
             AND p.trial_end <= now() + INTERVAL '7 days')
          )
        )
        OR (
          _status = 'expired' AND (
            p.license_status = 'expired'
            OR (p.license_status NOT IN ('permanent', 'trial') AND p.expiry_date IS NOT NULL AND p.expiry_date < CURRENT_DATE)
            OR (p.license_status = 'trial' AND p.trial_end IS NOT NULL AND p.trial_end < now())
          )
        )
        OR (_status NOT IN ('expiring_soon', 'expired') AND p.license_status::TEXT = _status)
      )
    ORDER BY p.created_at DESC LIMIT _page_size OFFSET _offset
  ) sub;
  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::JSONB), 'total', _total, 'page', _page, 'page_size', _page_size);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_get_all_users_license(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license(text, text, integer, integer) TO authenticated, service_role;
