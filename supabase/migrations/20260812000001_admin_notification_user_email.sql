-- =============================================================================
-- Admin notifications: resolve a single recipient by email (secure, server-side).
--
-- 1. _resolve_notification_audience     -> defense-in-depth: if a send_config
--    carries user_email (and no user_id), resolve it inside the database so no
--    client-provided value is ever trusted as an identifier.
-- 2. admin_create_notification          -> refuse to send to nobody when the
--    audience is "single" but no recipient could be resolved.
--
-- The admin UI picks the recipient from admin_search_notification_users (a real
-- server-side user row), so the UUID sent back is always genuine. The email
-- branch below only guards against hand-crafted send_config payloads.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Audience resolver: support user_email as a secure server-side fallback
--    (identical audience semantics as before, with the new email branch).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolve_notification_audience(p_send_config JSONB)
RETURNS UUID[] LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_audience TEXT;
  v_ids UUID[];
  v_exclude UUID[];
  v_resolved UUID;
BEGIN
  v_audience := COALESCE(p_send_config->>'audience', 'all');
  v_exclude := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_send_config->'exclude_user_ids', '[]'::jsonb))::uuid)),
    '{}'::uuid[]
  );

  CASE v_audience
    WHEN 'all' THEN
      SELECT ARRAY(SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL) INTO v_ids;
    WHEN 'single' THEN
      -- Preferred: a real resolved UUID supplied by the backend flow.
      IF COALESCE(p_send_config->>'user_id', '') <> '' THEN
        v_ids := ARRAY[(p_send_config->>'user_id')::uuid];
      -- Fallback (defense in depth): resolve an exact email inside the database,
      -- never trust a client-provided email as an identifier.
      ELSIF COALESCE(p_send_config->>'user_email', '') <> '' THEN
        SELECT p.user_id INTO v_resolved FROM public.profiles p
        WHERE lower(btrim(p_send_config->>'user_email')) = lower(coalesce(p.email, ''))
           OR EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.user_id AND lower(btrim(p_send_config->>'user_email')) = lower(au.email))
        LIMIT 1;
        IF v_resolved IS NULL THEN
          RAISE EXCEPTION 'user_not_found';
        END IF;
        v_ids := ARRAY[v_resolved];
      ELSE
        v_ids := '{}'::uuid[];
      END IF;
      v_ids := array_remove(v_ids, NULL);
    WHEN 'list' THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_send_config->'user_ids', '[]'::jsonb))::uuid) INTO v_ids;
    WHEN 'active_license' THEN
      SELECT ARRAY(SELECT user_id FROM public.profiles
                   WHERE user_id IS NOT NULL
                     AND license_status IN ('active', 'permanent')
                     AND (account_status IS NULL OR account_status = 'active')) INTO v_ids;
    WHEN 'trial' THEN
      SELECT ARRAY(SELECT user_id FROM public.profiles
                   WHERE user_id IS NOT NULL AND license_status = 'trial') INTO v_ids;
    WHEN 'expired' THEN
      SELECT ARRAY(SELECT user_id FROM public.profiles
                   WHERE user_id IS NOT NULL
                     AND (license_status IN ('expired', 'rejected', 'blocked')
                          OR (license_status = 'trial' AND trial_end IS NOT NULL AND trial_end < now())
                          OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE))) INTO v_ids;
    WHEN 'no_license' THEN
      SELECT ARRAY(SELECT user_id FROM public.profiles
                   WHERE user_id IS NOT NULL
                     AND license_status NOT IN ('active', 'permanent')) INTO v_ids;
    WHEN 'role' THEN
      SELECT ARRAY(SELECT ur.user_id FROM public.user_roles ur
                   WHERE ur.role::text = COALESCE(p_send_config->>'role', 'user')) INTO v_ids;
    ELSE
      SELECT ARRAY(SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL) INTO v_ids;
  END CASE;

  v_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(v_ids) AS x
    WHERE x IS NOT NULL AND NOT (x = ANY(v_exclude))
  );
  RETURN v_ids;
END; $$;

-- -----------------------------------------------------------------------------
-- 2. admin_create_notification: never send to nobody when targeting one user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_notification(
  p_title_ar TEXT,
  p_title_en TEXT,
  p_body_ar TEXT,
  p_body_en TEXT,
  p_type public.notification_type DEFAULT 'custom',
  p_priority public.notification_priority DEFAULT 'normal',
  p_action_type public.notification_action_type DEFAULT 'none',
  p_action_target TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_send_config JSONB DEFAULT '{}'::jsonb,
  p_requires_acknowledgement BOOLEAN DEFAULT false,
  p_is_pinned BOOLEAN DEFAULT false,
  p_is_announcement BOOLEAN DEFAULT false,
  p_image_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_id UUID;
  v_recipients UUID[];
  v_audience TEXT;
BEGIN
  v_admin := public._require_admin();
  IF p_title_ar IS NULL THEN p_title_ar := ''; END IF;
  IF p_title_en IS NULL THEN p_title_en := ''; END IF;
  IF p_body_ar IS NULL THEN p_body_ar := ''; END IF;
  IF p_body_en IS NULL THEN p_body_en := ''; END IF;
  IF p_send_config IS NULL THEN p_send_config := '{}'::jsonb; END IF;
  IF p_metadata IS NULL THEN p_metadata := '{}'::jsonb; END IF;

  p_title_ar := left(btrim(p_title_ar), 255);
  p_title_en := left(btrim(p_title_en), 255);
  p_body_ar  := left(btrim(p_body_ar), 10000);
  p_body_en  := left(btrim(p_body_en), 10000);
  p_action_target := NULLIF(left(btrim(COALESCE(p_action_target, '')), 500), '');

  IF p_title_ar = '' AND p_title_en = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'title_required');
  END IF;

  v_audience := COALESCE(p_send_config->>'audience', 'all');

  INSERT INTO public.notifications (
    title_ar, title_en, body_ar, body_en, notification_type, priority,
    action_type, action_target, expires_at, scheduled_at, send_config,
    requires_acknowledgement, is_pinned, is_announcement, image_url, metadata,
    created_by, status, sent_at, version
  )
  VALUES (
    p_title_ar, p_title_en, p_body_ar, p_body_en, p_type, p_priority,
    p_action_type, p_action_target, p_expires_at, p_scheduled_at, p_send_config,
    p_requires_acknowledgement, p_is_pinned, p_is_announcement, p_image_url, p_metadata,
    v_admin,
    CASE WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN 'scheduled'::public.notification_status
         ELSE 'sent'::public.notification_status END,
    CASE WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN NULL ELSE now() END,
    1
  )
  RETURNING id INTO v_id;

  IF v_audience IN ('none', 'draft') THEN
    UPDATE public.notifications SET status = 'draft' WHERE id = v_id;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
    VALUES (v_admin, 'notification_create', 'notification', v_id::text,
            jsonb_build_object('type', p_type, 'status', 'draft', 'audience', v_audience));
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'draft');
  END IF;

  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > now() THEN
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
    VALUES (v_admin, 'notification_schedule', 'notification', v_id::text,
            jsonb_build_object('type', p_type, 'scheduled_at', p_scheduled_at, 'audience', v_audience));
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'scheduled');
  END IF;

  -- Immediate send
  v_recipients := public._resolve_notification_audience(p_send_config);
  IF v_audience = 'single' AND (v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL) THEN
    DELETE FROM public.notifications WHERE id = v_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'recipient_required');
  END IF;

  INSERT INTO public.notification_recipients (notification_id, user_id, status, delivered_at, delivered_version)
  SELECT v_id, unnest(v_recipients), 'delivered', now(), 1;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_send', 'notification', v_id::text,
          jsonb_build_object('type', p_type, 'audience', v_audience, 'recipients', array_length(v_recipients, 1)));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', 'sent', 'recipients', array_length(v_recipients, 1));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_create_notification(
  TEXT, TEXT, TEXT, TEXT, public.notification_type, public.notification_priority,
  public.notification_action_type, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_create_notification(
  TEXT, TEXT, TEXT, TEXT, public.notification_type, public.notification_priority,
  public.notification_action_type, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB
) TO authenticated, service_role;
