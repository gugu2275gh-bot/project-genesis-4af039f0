-- Add INSERT policy for staff on client-documents bucket
CREATE POLICY "Staff can upload receipts and documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY (ARRAY[
      'ADMIN'::app_role, 
      'MANAGER'::app_role, 
      'FINANCEIRO'::app_role, 
      'JURIDICO'::app_role,
      'TECNICO'::app_role,
      'ATENCAO_CLIENTE'::app_role
    ])
  )
);