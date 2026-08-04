CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window ON public.rate_limits (key, window_start);

CREATE OR REPLACE FUNCTION public.check_rate_limit(_key TEXT, _window_seconds INTEGER DEFAULT 60, _max_requests INTEGER DEFAULT 5)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cutoff TIMESTAMPTZ := now() - (INTERVAL '1 second' * _window_seconds); _count INTEGER; BEGIN
  DELETE FROM public.rate_limits WHERE window_start < _cutoff;
  SELECT COUNT(*) INTO _count FROM public.rate_limits WHERE key = _key AND window_start >= _cutoff;
  IF _count >= _max_requests THEN RETURN false; END IF;
  INSERT INTO public.rate_limits (key, window_start, request_count) VALUES (_key, now(), 1);
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated;