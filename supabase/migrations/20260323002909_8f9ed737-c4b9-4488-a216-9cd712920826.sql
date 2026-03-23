
-- Drop the existing sector policy and recreate without setor IS NULL for sector roles
DROP POLICY IF EXISTS "Sector roles can view their sector messages" ON public.mensagens_cliente;

CREATE POLICY "Sector roles can view their sector messages"
ON public.mensagens_cliente
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role])
  AND setor IS NOT NULL
  AND setor = ANY(get_user_sector_names(auth.uid()))
);
