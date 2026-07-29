-- Fix: Allow users to read their own activation requests (polling)
-- After the hardening migration, activations table only had admin SELECT policy.
-- This breaks the frontend polling in checkActivationStatus().
CREATE POLICY "Users read own activations" ON public.activations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Ensure admin_decide_activation is callable through admin-rpc edge function
-- (already granted to service_role in 02_post_hardening.sql)
