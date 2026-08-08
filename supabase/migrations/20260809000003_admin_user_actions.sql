-- =============================================================================
-- admin_get_all_users_license: return ALL profile + auth info for every user
-- admin_delete_user: safely delete a user and all related data
-- =============================================================================

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
      AND (_status IS NULL OR p.license_status::TEXT = _status) ORDER BY p.created_at DESC LIMIT _page_size OFFSET _offset
  ) sub;
  RETURN jsonb_build_object('users', COALESCE(_users, '[]'::JSONB), 'total', _total, 'page', _page, 'page_size', _page_size);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_get_all_users_license(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users_license(text, text, integer, integer) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- admin_delete_user: delete a user and all their data (devices, sessions,
-- activations, licenses, transfers, payments, profile, auth entry...).
-- Refuses to delete yourself or the last remaining admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_is_admin boolean;
  v_admin_count bigint;
BEGIN
  v_admin := public._require_admin();
  IF _target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target');
  END IF;
  IF v_admin = _target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_delete_self');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin') INTO v_is_admin;
  SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';
  IF v_is_admin AND v_admin_count <= 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'last_admin');
  END IF;

  -- Clear cross-references coming FROM other rows pointing at this user/profile
  UPDATE public.payments SET confirmed_by = NULL, created_by = NULL WHERE confirmed_by = _target_user_id OR created_by = _target_user_id;
  UPDATE public.transfers SET completed_by = NULL, created_by = NULL WHERE completed_by = _target_user_id OR created_by = _target_user_id;

  -- Delete child rows explicitly (covers both FK-restricted and non-FK tables)
  DELETE FROM public.admin_actions WHERE admin_id = _target_user_id OR target_user_id = _target_user_id;
  DELETE FROM public.activations WHERE user_id = _target_user_id OR processed_by = _target_user_id;
  DELETE FROM public.amount_presets WHERE user_id = _target_user_id;
  DELETE FROM public.app_events WHERE user_id = _target_user_id;
  DELETE FROM public.app_settings WHERE user_id = _target_user_id;
  DELETE FROM public.app_usage WHERE user_id = _target_user_id;
  DELETE FROM public.audit_logs WHERE user_id = _target_user_id OR actor_user_id = _target_user_id OR target_user_id = _target_user_id;
  DELETE FROM public.account_lockouts WHERE user_id = _target_user_id;
  DELETE FROM public.contacts WHERE user_id = _target_user_id;
  DELETE FROM public.daily_summaries WHERE user_id = _target_user_id;
  DELETE FROM public.device_auth WHERE user_id = _target_user_id;
  DELETE FROM public.device_bans WHERE user_id = _target_user_id;
  DELETE FROM public.devices WHERE user_id = _target_user_id;
  DELETE FROM public.error_logs WHERE user_id = _target_user_id;
  DELETE FROM public.licenses WHERE user_id = _target_user_id OR created_by = _target_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = _target_user_id;
  DELETE FROM public.notification_recipients WHERE user_id = _target_user_id;
  DELETE FROM public.notifications WHERE created_by = _target_user_id;
  DELETE FROM public.notification_versions WHERE edited_by = _target_user_id;
  DELETE FROM public.payments WHERE user_id = _target_user_id;
  DELETE FROM public.sessions WHERE user_id = _target_user_id;
  DELETE FROM public.sim_assignments WHERE user_id = _target_user_id;
  DELETE FROM public.sync_conflicts WHERE user_id = _target_user_id;
  DELETE FROM public.sync_logs WHERE user_id = _target_user_id;
  DELETE FROM public.sync_metrics WHERE user_id = _target_user_id;
  DELETE FROM public.transfers WHERE user_id = _target_user_id;
  DELETE FROM public.trials WHERE user_id = _target_user_id;
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  DELETE FROM public.user_settings WHERE user_id = _target_user_id;
  DELETE FROM public.ussd_codes WHERE user_id = _target_user_id;
  DELETE FROM public.profiles WHERE user_id = _target_user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'delete_user', 'user', _target_user_id::TEXT, jsonb_build_object());

  -- Finally remove the auth identity (everything left cascades)
  DELETE FROM auth.users WHERE id = _target_user_id;

  RETURN jsonb_build_object('ok', true, 'deleted_user', _target_user_id);
END; $$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;
