
REVOKE EXECUTE ON FUNCTION public.enforce_device_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_device_cloning() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_device_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_device_cloning() TO service_role;
