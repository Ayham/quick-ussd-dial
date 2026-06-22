
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_set_license_status(uuid,text,text)',
    'admin_extend_license(uuid,date)',
    'admin_convert_license(uuid,boolean,date)',
    'admin_block_device(text,text)',
    'admin_unblock_device(text)',
    'admin_extend_trial(text,integer)',
    'admin_end_trial(text)',
    'admin_convert_trial(text,uuid)',
    'admin_decide_activation(uuid,text,uuid,text)',
    'admin_set_role(uuid,public.app_role,boolean)',
    'admin_transfer_license(uuid,text,text)',
    '_require_admin()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;
