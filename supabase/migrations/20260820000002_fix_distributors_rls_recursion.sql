-- Migration: Fix infinite recursion in distributors RLS policy
-- The previous distributor_select_own policy joined distributors inside its subquery, causing PostgREST 500 errors.

DROP POLICY IF EXISTS "distributor_select_own" ON public.distributors;

CREATE POLICY "distributor_select_own" ON public.distributors
  FOR SELECT
  USING (
    id = (SELECT p.distributor_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND public.has_role(auth.uid(), 'distributor'::app_role)
  );
