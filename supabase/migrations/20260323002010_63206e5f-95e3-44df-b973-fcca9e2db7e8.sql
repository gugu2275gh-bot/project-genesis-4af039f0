
-- Add RLS policies for sector-based roles (JURIDICO, FINANCEIRO, TECNICO, EXPEDIENTE)
-- They can view messages that match their sector (via user_sectors) or have no sector (legacy)

CREATE OR REPLACE FUNCTION public.get_user_sector_names(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(ss.name),
    ARRAY[]::text[]
  )
  FROM user_sectors us
  JOIN service_sectors ss ON ss.id = us.sector_id
  WHERE us.user_id = _user_id;
$$;

-- Sector-based roles can view messages tagged with their sector or untagged
CREATE POLICY "Sector roles can view their sector messages"
ON public.mensagens_cliente
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role])
  AND (
    setor IS NULL
    OR setor = ANY(get_user_sector_names(auth.uid()))
  )
);

-- Sector-based roles can insert messages (tagged with their sector)
CREATE POLICY "Sector roles can insert messages"
ON public.mensagens_cliente
FOR INSERT
TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role])
);

-- DIRETORIA gets global view (like supervisors)
CREATE POLICY "Directors can view all messages"
ON public.mensagens_cliente
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'DIRETORIA'::app_role)
);
