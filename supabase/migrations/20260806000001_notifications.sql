-- ============================================================================
-- IN-APP NOTIFICATION SYSTEM
-- ----------------------------------------------------------------------------
-- Normalized, offline-first, RLS-protected notification management:
--   * notifications           -> bilingual content, type, priority, lifecycle
--   * notification_recipients -> per-user delivery / read / ack / dismiss
--   * notification_versions   -> immutable content history (edit never rewrites
--                                 already-delivered snapshots)
--   * notification_preferences-> per-user category toggles (sound/vibration)
--   * admin_actions           -> existing audit log reused for every admin action
--
-- Security model:
--   * Only admins can create / update / delete / send / archive / restore.
--   * Users may only read & mutate their own recipient rows (via RPCs).
--   * Every RPC validates auth.uid() and admin privileges server-side.
--   * Realtime is scoped by RLS (only own recipients are broadcast).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'notification_type') THEN
    CREATE TYPE public.notification_type AS ENUM (
      'custom', 'license_expiring', 'license_expired', 'license_activated',
      'license_revoked', 'trial_started', 'trial_ended', 'account_suspended',
      'account_restored', 'security_alert', 'announcement', 'system_update',
      'transfer_success', 'transfer_failure'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'notification_priority') THEN
    CREATE TYPE public.notification_priority AS ENUM ('low', 'normal', 'high', 'critical');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'notification_status') THEN
    CREATE TYPE public.notification_status AS ENUM (
      'draft', 'scheduled', 'sent', 'archived', 'cancelled', 'failed'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'notification_action_type') THEN
    CREATE TYPE public.notification_action_type AS ENUM ('none', 'screen', 'url', 'custom');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'notification_recipient_status') THEN
    CREATE TYPE public.notification_recipient_status AS ENUM ('pending', 'delivered', 'failed');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  notification_type public.notification_type NOT NULL DEFAULT 'custom',
  priority public.notification_priority NOT NULL DEFAULT 'normal',
  status public.notification_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  action_type public.notification_action_type NOT NULL DEFAULT 'none',
  action_target TEXT,
  image_url TEXT,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  send_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.notification_recipient_status NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  delivered_version INTEGER NOT NULL DEFAULT 1,
  read_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notification_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  notification_type public.notification_type,
  priority public.notification_priority,
  action_type public.notification_action_type,
  action_target TEXT,
  image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, version)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  vibration_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

-- ---------------------------------------------------------------------------
-- 2b. SAFETY: add missing columns if table pre-existed from a partial migration
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'notification_type') THEN
    ALTER TABLE public.notifications ADD COLUMN notification_type public.notification_type NOT NULL DEFAULT 'custom';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'priority') THEN
    ALTER TABLE public.notifications ADD COLUMN priority public.notification_priority NOT NULL DEFAULT 'normal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'status') THEN
    ALTER TABLE public.notifications ADD COLUMN status public.notification_status NOT NULL DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_type') THEN
    ALTER TABLE public.notifications ADD COLUMN action_type public.notification_action_type NOT NULL DEFAULT 'none';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_target') THEN
    ALTER TABLE public.notifications ADD COLUMN action_target TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'send_config') THEN
    ALTER TABLE public.notifications ADD COLUMN send_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'version') THEN
    ALTER TABLE public.notifications ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'requires_acknowledgement') THEN
    ALTER TABLE public.notifications ADD COLUMN requires_acknowledgement BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_pinned') THEN
    ALTER TABLE public.notifications ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_announcement') THEN
    ALTER TABLE public.notifications ADD COLUMN is_announcement BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'image_url') THEN
    ALTER TABLE public.notifications ADD COLUMN image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'metadata') THEN
    ALTER TABLE public.notifications ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'scheduled_at') THEN
    ALTER TABLE public.notifications ADD COLUMN scheduled_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'sent_at') THEN
    ALTER TABLE public.notifications ADD COLUMN sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'expires_at') THEN
    ALTER TABLE public.notifications ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_deleted') THEN
    ALTER TABLE public.notifications ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'created_by') THEN
    ALTER TABLE public.notifications ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'created_at') THEN
    ALTER TABLE public.notifications ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'updated_at') THEN
    ALTER TABLE public.notifications ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'delivered_at') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN delivered_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'read_at') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN read_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'is_read') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'is_favorite') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'is_deleted') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'created_at') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_recipients' AND column_name = 'updated_at') THEN
    ALTER TABLE public.notification_recipients ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_status      ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type        ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority    ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_created     ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled   ON public.notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_expires     ON public.notifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pinned      ON public.notifications(is_pinned);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by  ON public.notifications(created_by);

CREATE INDEX IF NOT EXISTS idx_notif_recip_user           ON public.notification_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_recip_user_read      ON public.notification_recipients(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_recip_notification   ON public.notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_recip_updated        ON public.notification_recipients(updated_at);
CREATE INDEX IF NOT EXISTS idx_notif_recip_created        ON public.notification_recipients(created_at);

CREATE INDEX IF NOT EXISTS idx_notif_versions_notification ON public.notification_versions(notification_id, version);

-- ---------------------------------------------------------------------------
-- 4. TRIGGERS (updated_at)
-- ---------------------------------------------------------------------------
CREATE TRIGGER notifications_updated BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER notification_recipients_updated BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER notification_preferences_updated BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- notifications: admins manage everything; users may read what was delivered to them
DROP POLICY IF EXISTS "Notifications admins all" ON public.notifications;
CREATE POLICY "Notifications admins all" ON public.notifications
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Notifications users read delivered" ON public.notifications;
CREATE POLICY "Notifications users read delivered" ON public.notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.notification_recipients r
      WHERE r.notification_id = notifications.id AND r.user_id = auth.uid() AND NOT r.is_deleted
    )
  );

-- notification_recipients: users manage their own rows; admins see all
DROP POLICY IF EXISTS "Notification recipients users select own" ON public.notification_recipients;
CREATE POLICY "Notification recipients users select own" ON public.notification_recipients
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Notification recipients users update own" ON public.notification_recipients;
CREATE POLICY "Notification recipients users update own" ON public.notification_recipients
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Notification recipients admins all" ON public.notification_recipients;
CREATE POLICY "Notification recipients admins all" ON public.notification_recipients
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- notification_versions: admin-only (content history)
DROP POLICY IF EXISTS "Notification versions admins all" ON public.notification_versions;
CREATE POLICY "Notification versions admins all" ON public.notification_versions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- notification_preferences: users manage own
DROP POLICY IF EXISTS "Notification preferences users own" ON public.notification_preferences;
CREATE POLICY "Notification preferences users own" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. REALTIME PUBLICATION (RLS-scoped)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_recipients;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. HELPERS
-- ---------------------------------------------------------------------------
-- Resolve a send_config audience into concrete user ids.
--   audience: all | single | list | active_license | trial | expired | role | no_license
--   user_ids: uuid[] (for 'list')
--   user_id:  uuid   (for 'single')
--   role:     text   (for 'role')
--   exclude_user_ids: uuid[] (always applied)
-- Distributor / operator targeting is future-ready: extend this helper.
CREATE OR REPLACE FUNCTION public._resolve_notification_audience(p_send_config JSONB)
RETURNS UUID[] LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_audience TEXT;
  v_ids UUID[];
  v_exclude UUID[];
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
      v_ids := ARRAY[(p_send_config->>'user_id')::uuid];
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

-- ---------------------------------------------------------------------------
-- 8. USER-FACING RPCS
-- ---------------------------------------------------------------------------
-- Incremental, paginated, filterable feed for the signed-in user.
CREATE OR REPLACE FUNCTION public.user_get_notifications(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 30,
  p_filter TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_order TEXT DEFAULT 'newest',
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_include_dismissed BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 30), 1), 100);
  v_offset INTEGER := (v_page - 1) * v_page_size;
  v_total BIGINT;
  v_unread BIGINT;
  v_items JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  WITH base AS (
    SELECT
      r.notification_id AS id,
      n.title_ar, n.title_en, n.body_ar, n.body_en,
      n.notification_type, n.priority, n.status,
      n.created_at, n.updated_at, n.sent_at, n.expires_at,
      n.action_type, n.action_target, n.image_url,
      n.requires_acknowledgement, n.is_pinned, n.is_announcement,
      n.metadata, n.version,
      r.id AS recipient_id,
      r.status AS recipient_status,
      r.delivered_at, r.read_at, r.acknowledged_at, r.dismissed_at,
      r.is_read, r.is_favorite, r.is_deleted,
      r.delivered_version, r.read_version
    FROM public.notification_recipients r
    JOIN public.notifications n ON n.id = r.notification_id
    WHERE r.user_id = v_uid
      AND NOT r.is_deleted
      AND NOT n.is_deleted
      AND n.status IN ('sent', 'archived')
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (p_include_dismissed OR r.dismissed_at IS NULL)
      AND (p_since IS NULL
           OR n.created_at >= p_since OR n.updated_at >= p_since
           OR r.created_at >= p_since OR r.updated_at >= p_since)
      AND (p_filter IS NULL OR p_filter = ''
           OR (p_filter = 'unread' AND NOT r.is_read)
           OR (p_filter = 'read' AND r.is_read))
      AND (p_type IS NULL OR p_type = '' OR n.notification_type::text = p_type)
      AND (p_priority IS NULL OR p_priority = '' OR n.priority::text = p_priority)
      AND (p_search IS NULL OR p_search = ''
           OR n.title_ar ILIKE '%' || p_search || '%'
           OR n.title_en ILIKE '%' || p_search || '%'
           OR n.body_ar ILIKE '%' || p_search || '%'
           OR n.body_en ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR n.created_at >= p_date_from)
      AND (p_date_to IS NULL OR n.created_at < p_date_to)
  )
  SELECT count(*) INTO v_total FROM base;

  SELECT count(*) INTO v_unread
  FROM public.notification_recipients r
  JOIN public.notifications n ON n.id = r.notification_id
  WHERE r.user_id = v_uid
    AND NOT r.is_read AND NOT r.is_deleted AND NOT n.is_deleted
    AND n.status IN ('sent', 'archived')
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND r.dismissed_at IS NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_items FROM (
    SELECT *
    FROM base
    ORDER BY is_pinned DESC,
             (NOT is_read) DESC,
             CASE WHEN p_order = 'oldest' THEN created_at END ASC,
             CASE WHEN p_order <> 'oldest' THEN created_at END DESC
    LIMIT v_page_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'unread_count', v_unread,
    'page', v_page,
    'page_size', v_page_size,
    'has_more', (v_offset + v_page_size) < v_total
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_get_notifications(
  TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_get_notifications(
  TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO authenticated, service_role;

-- Idempotent mark-read with version conflict resolution (offline-safe).
CREATE OR REPLACE FUNCTION public.user_mark_notification_read(
  p_notification_id UUID,
  p_read_version INTEGER DEFAULT 1,
  p_read_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  IF p_notification_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_id'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE id = p_notification_id AND NOT is_deleted AND status IN ('sent', 'archived')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  INSERT INTO public.notification_recipients (notification_id, user_id, is_read, read_at, read_version, status, delivered_version)
  VALUES (p_notification_id, v_uid, true, p_read_at, GREATEST(p_read_version, 1), 'delivered',
          (SELECT version FROM public.notifications WHERE id = p_notification_id))
  ON CONFLICT (notification_id, user_id) DO UPDATE SET
    is_read = true,
    read_at = COALESCE(public.notification_recipients.read_at, EXCLUDED.read_at),
    read_version = GREATEST(public.notification_recipients.read_version, EXCLUDED.read_version)
  WHERE public.notification_recipients.user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_mark_notification_read(UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_mark_notification_read(UUID, INTEGER, TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_mark_all_notifications_read()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  UPDATE public.notification_recipients r
  SET is_read = true, read_at = COALESCE(read_at, now()),
      read_version = GREATEST(read_version, COALESCE((SELECT version FROM public.notifications WHERE id = r.notification_id), read_version))
  WHERE r.user_id = v_uid AND NOT r.is_read AND r.dismissed_at IS NULL;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_mark_all_notifications_read() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_mark_all_notifications_read() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_toggle_notification_favorite(p_notification_id UUID, p_favorite BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  UPDATE public.notification_recipients
  SET is_favorite = COALESCE(p_favorite, NOT is_favorite)
  WHERE notification_id = p_notification_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_toggle_notification_favorite(UUID, BOOLEAN) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_toggle_notification_favorite(UUID, BOOLEAN) TO authenticated, service_role;

-- Local dismiss (users can never permanently delete).
CREATE OR REPLACE FUNCTION public.user_dismiss_notification(p_notification_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  UPDATE public.notification_recipients
  SET dismissed_at = now()
  WHERE notification_id = p_notification_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_dismiss_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_dismiss_notification(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_acknowledge_notification(p_notification_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  UPDATE public.notification_recipients
  SET acknowledged_at = now(), is_read = true, read_at = COALESCE(read_at, now())
  WHERE notification_id = p_notification_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_acknowledge_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_acknowledge_notification(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_get_notification_preferences()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_rows JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_rows FROM (
    SELECT notification_type, enabled, sound_enabled, vibration_enabled
    FROM public.notification_preferences WHERE user_id = v_uid
  ) sub;
  RETURN jsonb_build_object('ok', true, 'items', v_rows);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_get_notification_preferences() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_get_notification_preferences() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_set_notification_preferences(
  p_notification_type public.notification_type,
  p_enabled BOOLEAN DEFAULT NULL,
  p_sound_enabled BOOLEAN DEFAULT NULL,
  p_vibration_enabled BOOLEAN DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  IF p_notification_type IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_type'); END IF;
  INSERT INTO public.notification_preferences (user_id, notification_type, enabled, sound_enabled, vibration_enabled)
  VALUES (v_uid, p_notification_type,
          COALESCE(p_enabled, true), COALESCE(p_sound_enabled, true), COALESCE(p_vibration_enabled, true))
  ON CONFLICT (user_id, notification_type) DO UPDATE SET
    enabled = COALESCE(p_enabled, public.notification_preferences.enabled),
    sound_enabled = COALESCE(p_sound_enabled, public.notification_preferences.sound_enabled),
    vibration_enabled = COALESCE(p_vibration_enabled, public.notification_preferences.vibration_enabled),
    updated_at = now();
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.user_set_notification_preferences(
  public.notification_type, BOOLEAN, BOOLEAN, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.user_set_notification_preferences(
  public.notification_type, BOOLEAN, BOOLEAN, BOOLEAN
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. ADMIN RPCS
-- ---------------------------------------------------------------------------
-- Create + optionally send. Scheduled notifications wait for the scheduler.
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

-- Edit: snapshot the previous content as a version, never rewrite history.
CREATE OR REPLACE FUNCTION public.admin_update_notification(
  p_id UUID,
  p_title_ar TEXT DEFAULT NULL,
  p_title_en TEXT DEFAULT NULL,
  p_body_ar TEXT DEFAULT NULL,
  p_body_en TEXT DEFAULT NULL,
  p_type public.notification_type DEFAULT NULL,
  p_priority public.notification_priority DEFAULT NULL,
  p_action_type public.notification_action_type DEFAULT NULL,
  p_action_target TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_is_pinned BOOLEAN DEFAULT NULL,
  p_is_announcement BOOLEAN DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_clear_expires_at BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_old RECORD;
  v_new_version INTEGER;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_old FROM public.notifications WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  v_new_version := v_old.version + 1;

  -- Immutable snapshot of the previously delivered content
  INSERT INTO public.notification_versions (
    notification_id, version, title_ar, title_en, body_ar, body_en,
    notification_type, priority, action_type, action_target, image_url, metadata, edited_by
  ) VALUES (
    p_id, v_old.version, v_old.title_ar, v_old.title_en, v_old.body_ar, v_old.body_en,
    v_old.notification_type, v_old.priority, v_old.action_type, v_old.action_target,
    v_old.image_url, v_old.metadata, v_admin
  );

  UPDATE public.notifications SET
    title_ar = COALESCE(left(btrim(p_title_ar), 255), title_ar),
    title_en = COALESCE(left(btrim(p_title_en), 255), title_en),
    body_ar  = COALESCE(left(btrim(p_body_ar), 10000), body_ar),
    body_en  = COALESCE(left(btrim(p_body_en), 10000), body_en),
    notification_type = COALESCE(p_type, notification_type),
    priority = COALESCE(p_priority, priority),
    action_type = COALESCE(p_action_type, action_type),
    action_target = CASE WHEN p_action_target IS NULL THEN action_target ELSE NULLIF(left(btrim(p_action_target), 500), '') END,
    expires_at = CASE WHEN p_clear_expires_at THEN NULL WHEN p_expires_at IS NULL THEN expires_at ELSE p_expires_at END,
    is_pinned = COALESCE(p_is_pinned, is_pinned),
    is_announcement = COALESCE(p_is_announcement, is_announcement),
    image_url = COALESCE(p_image_url, image_url),
    metadata = COALESCE(p_metadata, metadata),
    version = v_new_version
  WHERE id = p_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_update', 'notification', p_id::text,
          jsonb_build_object('version', v_new_version, 'previous_version', v_old.version));

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'version', v_new_version);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_notification(
  UUID, TEXT, TEXT, TEXT, TEXT, public.notification_type, public.notification_priority,
  public.notification_action_type, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT, JSONB, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_update_notification(
  UUID, TEXT, TEXT, TEXT, TEXT, public.notification_type, public.notification_priority,
  public.notification_action_type, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT, JSONB, BOOLEAN
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_notification(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := public._require_admin();
  UPDATE public.notifications SET is_deleted = true WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_delete', 'notification', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_delete_notification(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_restore_notification(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := public._require_admin();
  UPDATE public.notifications SET is_deleted = false, status = 'sent' WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_restore', 'notification', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_restore_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_restore_notification(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_archive_notification(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := public._require_admin();
  UPDATE public.notifications SET status = 'archived' WHERE id = p_id AND status IN ('sent', 'scheduled');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_invalid_state'); END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_archive', 'notification', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_archive_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_archive_notification(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cancel_notification(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := public._require_admin();
  UPDATE public.notifications SET status = 'cancelled' WHERE id = p_id AND status = 'scheduled';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_not_scheduled'); END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_cancel', 'notification', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_cancel_notification(UUID) TO authenticated, service_role;

-- Trigger due scheduled notifications and send to their audience.
CREATE OR REPLACE FUNCTION public.admin_process_scheduled_notifications()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_count INTEGER := 0;
  v_ids UUID[];
  v_row RECORD;
BEGIN
  v_admin := public._require_admin();
  FOR v_row IN
    SELECT id, send_config FROM public.notifications
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now() AND NOT is_deleted
  LOOP
    v_ids := public._resolve_notification_audience(v_row.send_config);
    INSERT INTO public.notification_recipients (notification_id, user_id, status, delivered_at, delivered_version)
    SELECT v_row.id, unnest(v_ids), 'delivered', now(), 1;
    UPDATE public.notifications SET status = 'sent', sent_at = now() WHERE id = v_row.id;
    v_count := v_count + 1;
    INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
    VALUES (v_admin, 'notification_send_scheduled', 'notification', v_row.id::text,
            jsonb_build_object('recipients', array_length(v_ids, 1)));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'processed', v_count);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_process_scheduled_notifications() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_process_scheduled_notifications() TO authenticated, service_role;

-- Resend to a subset of recipients (re-delivery, reset read state).
CREATE OR REPLACE FUNCTION public.admin_resend_notification(p_id UUID, p_recipient_ids UUID[] DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_recipients UUID[]; v_count INTEGER := 0;
BEGIN
  v_admin := public._require_admin();
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN
    v_recipients := public._resolve_notification_audience(
      COALESCE((SELECT send_config FROM public.notifications WHERE id = p_id), '{}'::jsonb)
    );
  ELSE
    v_recipients := p_recipient_ids;
  END IF;

  INSERT INTO public.notification_recipients (notification_id, user_id, status, delivered_at, delivered_version)
  SELECT p_id, unnest(v_recipients), 'delivered', now(),
         (SELECT version FROM public.notifications WHERE id = p_id)
  ON CONFLICT (notification_id, user_id) DO UPDATE SET
    is_read = false, read_at = NULL, read_version = 0,
    status = 'delivered', delivered_at = now(), dismissed_at = NULL,
    delivered_version = (SELECT version FROM public.notifications WHERE id = p_id);

  SELECT count(*) INTO v_count FROM public.notification_recipients WHERE notification_id = p_id;
  UPDATE public.notifications SET status = 'sent', sent_at = now() WHERE id = p_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_resend', 'notification', p_id::text,
          jsonb_build_object('recipients', array_length(v_recipients, 1)));
  RETURN jsonb_build_object('ok', true, 'recipients', v_count);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_resend_notification(UUID, UUID[]) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_resend_notification(UUID, UUID[]) TO authenticated, service_role;

-- Paginated admin list with per-notification read statistics.
CREATE OR REPLACE FUNCTION public.admin_get_notifications(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_status TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_offset INTEGER := (v_page - 1) * v_page_size;
  v_total BIGINT;
  v_items JSONB;
BEGIN
  v_admin := public._require_admin();
  WITH base AS (
    SELECT
      n.*,
      p.email AS creator_email,
      p.display_name AS creator_name,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND NOT r.is_deleted) AS recipients_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND r.is_read) AS read_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND NOT r.is_read AND NOT r.is_deleted) AS unread_count,
      (SELECT count(*) FROM public.notification_recipients r WHERE r.notification_id = n.id AND r.acknowledged_at IS NOT NULL) AS ack_count
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.user_id = n.created_by
    WHERE (p_include_deleted OR NOT n.is_deleted)
      AND (p_status IS NULL OR p_status = '' OR n.status::text = p_status)
      AND (p_type IS NULL OR p_type = '' OR n.notification_type::text = p_type)
      AND (p_search IS NULL OR p_search = ''
           OR n.title_ar ILIKE '%' || p_search || '%'
           OR n.title_en ILIKE '%' || p_search || '%'
           OR n.body_ar ILIKE '%' || p_search || '%'
           OR n.body_en ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR n.created_at >= p_date_from)
      AND (p_date_to IS NULL OR n.created_at < p_date_to)
  )
  SELECT count(*) INTO v_total FROM base;
  SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_items FROM (
    SELECT * FROM base ORDER BY created_at DESC LIMIT v_page_size OFFSET v_offset
  ) sub;
  RETURN jsonb_build_object('ok', true, 'items', v_items, 'total', v_total,
                            'page', v_page, 'page_size', v_page_size,
                            'has_more', (v_offset + v_page_size) < v_total);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notifications(
  INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notifications(
  INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_notification_detail(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_notification JSONB; v_recipients JSONB; v_versions JSONB;
BEGIN
  v_admin := public._require_admin();
  SELECT to_jsonb(n) INTO v_notification FROM public.notifications n WHERE n.id = p_id;
  IF v_notification IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT COALESCE(jsonb_agg(sub ORDER BY created_at DESC), '[]'::jsonb) INTO v_recipients FROM (
    SELECT
      r.id, r.notification_id, r.user_id, r.status, r.delivered_at, r.read_at,
      r.acknowledged_at, r.dismissed_at, r.is_read, r.is_favorite, r.is_deleted,
      r.delivered_version, r.read_version, r.created_at, r.updated_at,
      p.display_name, p.email, p.phone
    FROM public.notification_recipients r
    LEFT JOIN public.profiles p ON p.user_id = r.user_id
    WHERE r.notification_id = p_id
    ORDER BY r.created_at DESC
    LIMIT 500
  ) sub;

  SELECT COALESCE(jsonb_agg(to_jsonb(sub) ORDER BY version), '[]'::jsonb) INTO v_versions FROM (
    SELECT version, title_ar, title_en, body_ar, body_en, notification_type, priority,
           action_type, action_target, image_url, metadata, edited_at
    FROM public.notification_versions WHERE notification_id = p_id
  ) sub;

  RETURN jsonb_build_object(
    'ok', true, 'notification', v_notification,
    'recipients', v_recipients,
    'recipients_count', (SELECT count(*) FROM jsonb_array_length(v_recipients)),
    'versions', v_versions
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notification_detail(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_detail(UUID) TO authenticated, service_role;

-- Recipient picker: paginated search with license context.
CREATE OR REPLACE FUNCTION public.admin_search_notification_users(
  p_search TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_offset INTEGER := (v_page - 1) * v_page_size;
  v_total BIGINT;
  v_users JSONB;
BEGIN
  v_admin := public._require_admin();
  SELECT count(*) INTO v_total FROM public.profiles p
  WHERE (p_search IS NULL OR p_search = ''
         OR p.display_name ILIKE '%' || p_search || '%'
         OR p.email ILIKE '%' || p_search || '%'
         OR p.phone ILIKE '%' || p_search || '%');
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_users FROM (
    SELECT p.user_id, p.display_name, p.email, p.phone, p.license_status, p.license_type,
           p.trial_end, p.expiry_date, p.account_status, p.shop_name, p.created_at
    FROM public.profiles p
    WHERE (p_search IS NULL OR p_search = ''
           OR p.display_name ILIKE '%' || p_search || '%'
           OR p.email ILIKE '%' || p_search || '%'
           OR p.phone ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT v_page_size OFFSET v_offset
  ) sub;
  RETURN jsonb_build_object('ok', true, 'users', v_users, 'total', v_total,
                            'page', v_page, 'page_size', v_page_size,
                            'has_more', (v_offset + v_page_size) < v_total);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_search_notification_users(TEXT, INTEGER, INTEGER) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_search_notification_users(TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- Segment counts for the recipient selector.
CREATE OR REPLACE FUNCTION public.admin_get_notification_segments()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_all BIGINT; v_active BIGINT; v_trial BIGINT; v_expired BIGINT; v_none BIGINT; v_roles JSONB;
BEGIN
  v_admin := public._require_admin();
  SELECT count(*) INTO v_all FROM public.profiles;
  SELECT count(*) INTO v_active FROM public.profiles WHERE license_status IN ('active', 'permanent') AND (account_status IS NULL OR account_status = 'active');
  SELECT count(*) INTO v_trial FROM public.profiles WHERE license_status = 'trial';
  SELECT count(*) INTO v_expired FROM public.profiles WHERE license_status IN ('expired', 'rejected', 'blocked') OR (expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE);
  SELECT count(*) INTO v_none FROM public.profiles WHERE license_status NOT IN ('active', 'permanent');
  SELECT COALESCE(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_roles FROM (
    SELECT ur.role::text AS role, count(*) AS count FROM public.user_roles ur GROUP BY ur.role
  ) sub;
  RETURN jsonb_build_object('ok', true,
    'all', v_all, 'active_license', v_active, 'trial', v_trial, 'expired', v_expired, 'no_license', v_none,
    'roles', v_roles);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notification_segments() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_segments() TO authenticated, service_role;

-- Statistics dashboard.
CREATE OR REPLACE FUNCTION public.admin_get_notification_stats()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID; v_result JSONB;
BEGIN
  v_admin := public._require_admin();
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted),
    'sent_today', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= date_trunc('day', now())),
    'sent_week', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= now() - INTERVAL '7 days'),
    'sent_month', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND sent_at IS NOT NULL AND sent_at >= date_trunc('month', now())),
    'scheduled', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND status = 'scheduled'),
    'pinned', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND is_pinned),
    'drafts', (SELECT count(*) FROM public.notifications WHERE NOT is_deleted AND status = 'draft'),
    'unread', (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_read AND NOT r.is_deleted AND NOT n.is_deleted),
    'read', (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE r.is_read AND NOT r.is_deleted AND NOT n.is_deleted),
    'read_pct', CASE WHEN (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_deleted AND NOT n.is_deleted) = 0 THEN 0
                     ELSE round(100.0 * (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE r.is_read AND NOT r.is_deleted AND NOT n.is_deleted)
                              / (SELECT count(*) FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id WHERE NOT r.is_deleted AND NOT n.is_deleted), 1) END,
    'avg_read_minutes', COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (r.read_at - COALESCE(r.delivered_at, n.sent_at, n.created_at))) / 60.0), 1)
      FROM public.notification_recipients r JOIN public.notifications n ON n.id = r.notification_id
      WHERE r.read_at IS NOT NULL AND NOT r.is_deleted AND NOT n.is_deleted
    ), 0),
    'acknowledged', (SELECT count(*) FROM public.notification_recipients WHERE acknowledged_at IS NOT NULL AND NOT is_deleted),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', notification_type, 'count', count))
      FROM (SELECT notification_type, count(*) FROM public.notifications WHERE NOT is_deleted GROUP BY notification_type ORDER BY count DESC) t
    ), '[]'::jsonb),
    'by_priority', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', priority, 'count', count))
      FROM (SELECT priority, count(*) FROM public.notifications WHERE NOT is_deleted GROUP BY priority ORDER BY count DESC) t
    ), '[]'::jsonb),
    'top_users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'label', COALESCE(display_name, email, user_id::text), 'read_count', read_count))
      FROM (
        SELECT r.user_id, max(p.display_name) AS display_name, max(p.email) AS email, count(*) AS read_count
        FROM public.notification_recipients r
        LEFT JOIN public.profiles p ON p.user_id = r.user_id
        WHERE r.read_at IS NOT NULL AND NOT r.is_deleted
        GROUP BY r.user_id ORDER BY read_count DESC LIMIT 10
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_notification_stats() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_stats() TO authenticated, service_role;
