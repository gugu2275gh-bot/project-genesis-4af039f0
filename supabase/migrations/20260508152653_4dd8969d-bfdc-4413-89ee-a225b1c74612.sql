
-- Restrict INSERT policies on log/reminder tables to service_role only

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can create webhook logs" ON public.webhook_logs;
CREATE POLICY "Service role can insert webhook logs"
  ON public.webhook_logs FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert contract reminders" ON public.contract_reminders;
CREATE POLICY "Service role can insert contract reminders"
  ON public.contract_reminders FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert payment reminders" ON public.payment_reminders;
CREATE POLICY "Service role can insert payment reminders"
  ON public.payment_reminders FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert template logs" ON public.whatsapp_template_logs;
CREATE POLICY "Service role can insert template logs"
  ON public.whatsapp_template_logs FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert routing logs" ON public.chat_routing_logs;
CREATE POLICY "Service role can insert routing logs"
  ON public.chat_routing_logs FOR INSERT TO service_role WITH CHECK (true);

-- user_roles: add explicit admin-only INSERT/UPDATE/DELETE policies (in addition to existing ALL)
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role));

-- Restrictive policy: block self-role assignment to ADMIN even if any other policy allowed it
DROP POLICY IF EXISTS "Block non-admin role escalation" ON public.user_roles;
CREATE POLICY "Block non-admin role escalation"
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

-- superusers: explicit deny INSERT/UPDATE/DELETE for non-service_role
DROP POLICY IF EXISTS "Only service role can insert superusers" ON public.superusers;
CREATE POLICY "Only service role can insert superusers"
  ON public.superusers FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Only service role can update superusers" ON public.superusers;
CREATE POLICY "Only service role can update superusers"
  ON public.superusers FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Only service role can delete superusers" ON public.superusers;
CREATE POLICY "Only service role can delete superusers"
  ON public.superusers FOR DELETE TO service_role USING (true);
