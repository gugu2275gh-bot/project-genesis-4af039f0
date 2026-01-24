-- Adicionar coluna para URL do contrato assinado
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_document_url text;

-- Comentário descritivo
COMMENT ON COLUMN contracts.signed_document_url IS 'URL do documento do contrato assinado no Storage';

-- Criar bucket para contratos assinados
INSERT INTO storage.buckets (id, name, public) 
VALUES ('signed-contracts', 'signed-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Política para staff fazer upload
CREATE POLICY "Staff can upload signed contracts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signed-contracts'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'JURIDICO', 'FINANCEIRO')
  )
);

-- Política para staff visualizar
CREATE POLICY "Staff can view signed contracts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signed-contracts'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

-- Política para staff atualizar/deletar
CREATE POLICY "Staff can manage signed contracts"
ON storage.objects FOR ALL
USING (
  bucket_id = 'signed-contracts'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'JURIDICO')
  )
);