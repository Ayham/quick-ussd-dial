-- Add admin_unarchive_notification RPC function
CREATE OR REPLACE FUNCTION public.admin_unarchive_notification(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := public._require_admin();
  UPDATE public.notifications SET status = 'sent' WHERE id = p_id AND status = 'archived';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_not_archived'); END IF;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'notification_unarchive', 'notification', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_unarchive_notification(UUID) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_unarchive_notification(UUID) TO authenticated, service_role;
