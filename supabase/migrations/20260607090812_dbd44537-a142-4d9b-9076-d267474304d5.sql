
-- 1. app_events: allow users to insert their own events
CREATE POLICY "Users insert own events" ON public.app_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. devices: owner-scoped insert/update
CREATE POLICY "Users insert own device" ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own device" ON public.devices
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. trials: allow users to read trials for devices they own
CREATE POLICY "Users view own trial" ON public.trials
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.devices d
    WHERE d.device_id = trials.device_id AND d.user_id = auth.uid()
  ));

-- 4. user_settings: owner-scoped insert/update
CREATE POLICY "Users insert own settings" ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own settings" ON public.user_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. ussd_codes: owner-scoped insert/update/delete
CREATE POLICY "Users insert own ussd" ON public.ussd_codes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ussd" ON public.ussd_codes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ussd" ON public.ussd_codes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6. user_roles: prevent admin self/peer escalation through the Data API.
-- Replace the broad "Admins manage roles" policy with one that forbids
-- writing the 'admin' role from client-side requests. Admin promotion must
-- go through the admin-bootstrap edge function (service role).
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

CREATE POLICY "Admins manage non-admin roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'admin'::app_role)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND role <> 'admin'::app_role);
