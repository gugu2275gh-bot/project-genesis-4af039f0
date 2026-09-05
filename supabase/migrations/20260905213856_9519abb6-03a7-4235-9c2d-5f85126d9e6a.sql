INSERT INTO public.system_config (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.system_config TO anon;

DROP POLICY IF EXISTS "Anyone can read maintenance_mode" ON public.system_config;
CREATE POLICY "Anyone can read maintenance_mode"
ON public.system_config
FOR SELECT
TO anon, authenticated
USING (key = 'maintenance_mode');

DROP POLICY IF EXISTS "Owner can update maintenance_mode" ON public.system_config;
CREATE POLICY "Owner can update maintenance_mode"
ON public.system_config
FOR UPDATE
TO authenticated
USING (key = 'maintenance_mode' AND (auth.jwt() ->> 'email') = 'rvbarros@gmail.com')
WITH CHECK (key = 'maintenance_mode' AND (auth.jwt() ->> 'email') = 'rvbarros@gmail.com');