
-- Tighten failed_logins insert: require at least one identifying field
DROP POLICY IF EXISTS "failed_logins_anyone_insert" ON public.failed_logins;
CREATE POLICY "failed_logins_identified_insert" ON public.failed_logins FOR INSERT
  WITH CHECK (email IS NOT NULL OR ip IS NOT NULL);

-- ---- Device limit enforcement -------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only check on INSERT or when transitioning to active
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_active,false) = COALESCE(NEW.is_active,false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_active, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(sp.max_devices), 1) INTO v_limit
    FROM public.licenses l
    JOIN public.subscription_plans sp
      ON sp.code = l.plan OR sp.id::text = l.plan
   WHERE l.user_id = NEW.user_id
     AND l.status = 'active'
     AND (l.expires_at IS NULL OR l.expires_at > now());

  IF v_limit IS NULL THEN v_limit := 1; END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.devices d
   WHERE d.user_id = NEW.user_id
     AND d.is_active = true
     AND d.id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'device_limit_exceeded: plan allows % active device(s)', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_device_limit ON public.devices;
CREATE TRIGGER trg_enforce_device_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_device_limit();

-- ---- Anti-cloning detection ---------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_device_cloning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_user UUID;
BEGIN
  IF NEW.device_fingerprint IS NOT NULL THEN
    SELECT user_id INTO v_other_user
      FROM public.devices
     WHERE device_fingerprint = NEW.device_fingerprint
       AND user_id <> NEW.user_id
     LIMIT 1;
    IF v_other_user IS NOT NULL THEN
      INSERT INTO public.audit_logs(actor_user_id, target_user_id, device_id, action, entity, entity_id, metadata)
      VALUES (NEW.user_id, NEW.user_id, NEW.device_id, 'device_clone_suspected', 'devices', NEW.id::text,
              jsonb_build_object('fingerprint', NEW.device_fingerprint, 'other_user', v_other_user));
      INSERT INTO public.notifications(user_id, is_admin_target, type, title, body, metadata)
      VALUES (NULL, true, 'security', 'Suspected device clone',
              'A device fingerprint is registered to multiple users.',
              jsonb_build_object('device_id', NEW.device_id, 'user_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_device_cloning ON public.devices;
CREATE TRIGGER trg_detect_device_cloning
  AFTER INSERT OR UPDATE OF device_fingerprint, android_id ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.detect_device_cloning();
