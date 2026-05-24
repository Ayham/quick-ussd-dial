DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles(user_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS devices_device_id_key ON public.devices(device_id);
CREATE UNIQUE INDEX IF NOT EXISTS transfers_device_client_id_key ON public.transfers(device_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activations_request_token_key ON public.activations(request_token);
CREATE UNIQUE INDEX IF NOT EXISTS licenses_license_key_key ON public.licenses(license_key);