DROP POLICY IF EXISTS "Admins can manage config" ON public.system_config;
CREATE POLICY "Admins can manage config"
ON public.system_config
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

DROP POLICY IF EXISTS "Staff can view config" ON public.system_config;
CREATE POLICY "Staff can view config"
ON public.system_config
FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role]));