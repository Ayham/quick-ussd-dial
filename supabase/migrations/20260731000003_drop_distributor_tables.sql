-- Clean up distributor system: drop distributors, distributor_transactions, and distributor_customers tables

-- Drop policies first
DROP POLICY IF EXISTS "Users view own distributors" ON public.distributors;
DROP POLICY IF EXISTS "Admins manage distributors" ON public.distributors;
DROP POLICY IF EXISTS "Admins manage dist tx" ON public.distributor_transactions;
DROP POLICY IF EXISTS "Users view own dist tx" ON public.distributor_transactions;

-- Drop distributors table (cascades to distributor_transactions via FK)
DROP TABLE IF EXISTS public.distributors CASCADE;

-- Drop distributor_transactions table explicitly
DROP TABLE IF EXISTS public.distributor_transactions CASCADE;

-- Drop distributor_customers table (created externally, not in migrations)
DROP TABLE IF EXISTS public.distributor_customers CASCADE;