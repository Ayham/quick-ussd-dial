-- Per-shop distributor rate: the extra percentage a shop pays its distributor
-- on top of every transferred balance (e.g. 7 => pay 1070 for every 1000).
-- Stored on profiles so it syncs across devices like phone / shop_name.
-- NULL or 0 means no extra distributor cost.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS distributor_rate numeric DEFAULT NULL;
