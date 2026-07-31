ALTER TABLE public.app_events ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX idx_app_events_client_id ON public.app_events(client_id) WHERE client_id IS NOT NULL;