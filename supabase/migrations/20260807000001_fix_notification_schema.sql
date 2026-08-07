-- ============================================================================
-- FIX NOTIFICATION SCHEMA & RLS POLICIES
-- ----------------------------------------------------------------------------
-- Fixes issues introduced by 20260806000001_notifications.sql:
--   1. Old notifications table had different schema (user_id, title, body, type, is_admin_target)
--   2. Old RLS policies from 20260618104605 still active and conflicting
--   3. Hybrid schema causes RPC failures (400 Bad Request)
--   4. ERR_CONNECTION_CLOSED from database instability
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DROP OLD CONFLICTING RLS POLICIES FROM 20260618104605
-- ---------------------------------------------------------------------------
-- These policies use old column names (user_id, is_admin_target) that are
-- either NULL or missing in the new schema, causing access issues.
DO $$ BEGIN
  -- Drop old notifications policies
  DROP POLICY IF EXISTS "notifications_owner_select" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_owner_update" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  -- Drop old notification_recipients policies if they exist
  DROP POLICY IF EXISTS "notification_recipients_owner_select" ON public.notification_recipients;
  DROP POLICY IF EXISTS "notification_recipients_owner_update" ON public.notification_recipients;
  DROP POLICY IF EXISTS "notification_recipients_admin_all" ON public.notification_recipients;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. ADD MISSING COLUMNS FROM NEW SCHEMA
-- ---------------------------------------------------------------------------
-- The original migration used CREATE TABLE IF NOT EXISTS which didn't add
-- new columns to the pre-existing table. Add them now.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'title_ar') THEN
    ALTER TABLE public.notifications ADD COLUMN title_ar TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'title_en') THEN
    ALTER TABLE public.notifications ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'body_ar') THEN
    ALTER TABLE public.notifications ADD COLUMN body_ar TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'body_en') THEN
    ALTER TABLE public.notifications ADD COLUMN body_en TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'notification_type') THEN
    ALTER TABLE public.notifications ADD COLUMN notification_type public.notification_type NOT NULL DEFAULT 'custom';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'priority') THEN
    ALTER TABLE public.notifications ADD COLUMN priority public.notification_priority NOT NULL DEFAULT 'normal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'status') THEN
    ALTER TABLE public.notifications ADD COLUMN status public.notification_status NOT NULL DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'created_by') THEN
    ALTER TABLE public.notifications ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'updated_at') THEN
    ALTER TABLE public.notifications ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_type') THEN
    ALTER TABLE public.notifications ADD COLUMN action_type public.notification_action_type NOT NULL DEFAULT 'none';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_target') THEN
    ALTER TABLE public.notifications ADD COLUMN action_target TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'image_url') THEN
    ALTER TABLE public.notifications ADD COLUMN image_url TEXT;
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'metadata') THEN
    ALTER TABLE public.notifications ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'send_config') THEN
    ALTER TABLE public.notifications ADD COLUMN send_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'version') THEN
    ALTER TABLE public.notifications ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. MIGRATE DATA FROM OLD COLUMNS TO NEW SCHEMA
-- ---------------------------------------------------------------------------
-- The old notifications table had: user_id, title, body, type, is_admin_target, read_at
-- Move data to new bilingual columns and drop old ones.
DO $$ BEGIN
  -- Check if old columns exist and move data if needed
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'title') THEN
    
    -- Move data from old columns to new bilingual columns
    UPDATE public.notifications 
    SET 
      title_ar = COALESCE(title_ar, title),
      title_en = COALESCE(title_en, title),
      body_ar = COALESCE(body_ar, body),
      body_en = COALESCE(body_en, body),
      notification_type = COALESCE(notification_type, type::public.notification_type),
      is_announcement = COALESCE(is_announcement, is_admin_target)
    WHERE title IS NOT NULL OR body IS NOT NULL OR type IS NOT NULL OR is_admin_target IS NOT NULL;
    
    -- Drop old columns
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS user_id;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS title;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS body;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS type;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS is_admin_target;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS read_at;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. RE-CREATE CLEAN RLS POLICIES FOR NOTIFICATIONS
-- ---------------------------------------------------------------------------
-- Re-enable RLS and create clean policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admins have full access
DROP POLICY IF EXISTS "Notifications admins all" ON public.notifications;
CREATE POLICY "Notifications admins all" ON public.notifications
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Users can only read notifications delivered to them (not deleted)
DROP POLICY IF EXISTS "Notifications users read delivered" ON public.notifications;
CREATE POLICY "Notifications users read delivered" ON public.notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.notification_recipients r
      WHERE r.notification_id = notifications.id 
        AND r.user_id = auth.uid() 
        AND NOT r.is_deleted
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RE-CREATE CLEAN RLS POLICIES FOR NOTIFICATION_RECIPIENTS
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

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

-- ---------------------------------------------------------------------------
-- 6. RE-CREATE CLEAN RLS POLICIES FOR NOTIFICATION_VERSIONS & PREFERENCES
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification versions admins all" ON public.notification_versions;
CREATE POLICY "Notification versions admins all" ON public.notification_versions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification preferences users own" ON public.notification_preferences;
CREATE POLICY "Notification preferences users own" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. REINDEX NOTIFICATIONS TABLE FOR PERFORMANCE
-- ---------------------------------------------------------------------------
-- These indexes support the RPC queries
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON public.notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON public.notifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pinned ON public.notifications(is_pinned);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON public.notifications(created_by);

CREATE INDEX IF NOT EXISTS idx_notif_recip_user ON public.notification_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_recip_user_read ON public.notification_recipients(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_recip_notification ON public.notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_recip_updated ON public.notification_recipients(updated_at);
CREATE INDEX IF NOT EXISTS idx_notif_recip_created ON public.notification_recipients(created_at);

CREATE INDEX IF NOT EXISTS idx_notif_versions_notification ON public.notification_versions(notification_id, version);

-- ---------------------------------------------------------------------------
-- 8. FIX TRIGGERS FOR UPDATED_AT
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS notifications_updated ON public.notifications;
CREATE TRIGGER notifications_updated BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS notification_recipients_updated ON public.notification_recipients;
CREATE TRIGGER notification_recipients_updated BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS notification_preferences_updated ON public.notification_preferences;
CREATE TRIGGER notification_preferences_updated BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 9. REALTIME PUBLICATION (RLS-scoped)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
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
-- 10. GRANT EXECUTE ON RPC FUNCTIONS (ensure they exist and have grants)
-- ---------------------------------------------------------------------------
-- Grant all notification RPCs to anon, authenticated, service_role.
-- Security is enforced inside the functions (auth.uid() checks, _require_admin()).
-- Granting to anon prevents PostgREST 401/404 permission denied errors during initial session load.
GRANT EXECUTE ON FUNCTION public.user_get_notifications(
  TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.user_mark_notification_read(UUID, INTEGER, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_mark_all_notifications_read() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_toggle_notification_favorite(UUID, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_dismiss_notification(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_acknowledge_notification(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_get_notification_preferences() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_set_notification_preferences(
  public.notification_type, BOOLEAN, BOOLEAN, BOOLEAN
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_create_notification(
  TEXT, TEXT, TEXT, TEXT, public.notification_type, public.notification_priority,
  public.notification_action_type, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, JSONB
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_get_notifications(
  INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_get_notification_detail(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_notification_users(TEXT, INTEGER, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_segments() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_stats() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. RELOAD POSTGREST SCHEMA CACHE
-- ---------------------------------------------------------------------------
-- Force PostgREST to reload its schema cache to pick up new functions/grants
DO $$ BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
END $$;

-- ---------------------------------------------------------------------------
-- END OF FIX MIGRATION
-- ============================================================================