-- =============================================================================
-- Fix app_events upsert schema drift
--
-- The device-sync edge function upserts app_events with
-- `ON CONFLICT (device_id, client_id)`. PostgREST can only use a NON-partial
-- unique index/constraint as the arbiter. The remote table only had a partial
-- unique index (`WHERE client_id IS NOT NULL`), so every app_events upsert
-- failed with 42P10 and analytics events never synced.
--
-- This mirrors the working transfers setup (non-partial
-- `transfers_device_id_client_id_key`) and also aligns the JSON column with the
-- application convention (`data`, matching types.ts / the edge function).
--
-- Idempotent: safe to re-run on any environment.
-- =============================================================================

-- 1. JSON payload column: remote drifted to `payload`; code expects `data`.
ALTER TABLE public.app_events RENAME COLUMN IF EXISTS payload TO data;

-- 2. Non-partial unique index usable as an ON CONFLICT arbiter.
CREATE UNIQUE INDEX IF NOT EXISTS app_events_device_id_client_id_key
  ON public.app_events (device_id, client_id);

-- 3. The old partial index is now redundant and must not shadow the arbiter.
DROP INDEX IF EXISTS public.app_events_device_client_id_key;
