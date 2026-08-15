-- ============================================================================
-- Fix pre-existing broken trigger: detect_device_cloning() inserts into
-- public.notifications using columns that were removed during the
-- notifications rework (user_id, is_admin_target, type, title, body).
-- Every device INSERT/UPDATE whose fingerprint matches ANOTHER user's device
-- therefore raised `column "user_id" of relation "notifications" does not
-- exist`, aborting the whole device upsert (surfaced by SB5 trial abuse).
--
-- Fix: write into the current notifications schema (security_alert, admin
-- audience via send_config, en/ar titles) and never let a notification or
-- audit-log failure abort the device operation (defense in depth).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_device_cloning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_other_user uuid;
  v_other_id   text;
BEGIN
  IF NEW.device_fingerprint IS NOT NULL AND NEW.device_fingerprint <> '' THEN
    SELECT d.user_id, d.device_id::text INTO v_other_user, v_other_id
      FROM public.devices d
     WHERE d.device_fingerprint = NEW.device_fingerprint
       AND d.user_id <> NEW.user_id
       AND d.id <> NEW.id
     ORDER BY d.updated_at DESC
     LIMIT 1;

    IF v_other_user IS NOT NULL THEN
      BEGIN
        INSERT INTO public.audit_logs (actor_user_id, target_user_id, device_id, action, entity, entity_id, metadata)
        VALUES (NEW.user_id, NEW.user_id, NEW.device_id, 'device_clone_suspected', 'devices', NEW.id::text,
                jsonb_build_object('fingerprint', NEW.device_fingerprint, 'other_user', v_other_user, 'other_device', v_other_id));

        INSERT INTO public.notifications (
          notification_type, status, priority, is_announcement, send_config,
          created_by, title_en, title_ar, body_en, body_ar, metadata
        ) VALUES (
          'security_alert', 'sent', 'high', false,
          jsonb_build_object('audience', 'role', 'role', 'admin'),
          NEW.user_id,
          'Suspected device clone',
          'جهاز مشبوه مكرر',
          'A device fingerprint is registered to multiple users.',
          'بصمة الجهاز مسجلة لمستخدمين متعددين.',
          jsonb_build_object('device_id', NEW.device_id, 'user_id', NEW.user_id, 'other_user', v_other_user)
        );
      EXCEPTION WHEN OTHERS THEN
        NULL; -- detection must never break the device operation
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
