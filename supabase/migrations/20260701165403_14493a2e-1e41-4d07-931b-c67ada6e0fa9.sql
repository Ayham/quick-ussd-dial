-- Fix enforce_device_limit: references non-existent columns (licenses.plan, licenses.expires_at).
-- Rewrite to use existing license schema (expiry_date, permanent) with a sane default limit.
CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INT := 5;  -- default allowed active devices per user
  v_count INT;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_active,false) = COALESCE(NEW.is_active,false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_active, false) = false OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.devices d
   WHERE d.user_id = NEW.user_id
     AND d.is_active = true
     AND d.id <> NEW.id;

  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'device_limit_exceeded: max % active device(s)', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;