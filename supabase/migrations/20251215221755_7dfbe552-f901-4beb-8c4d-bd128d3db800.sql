-- Enable RLS on mensagens_cliente table
ALTER TABLE public.mensagens_cliente ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view messages
CREATE POLICY "Staff can view messages" 
ON public.mensagens_cliente 
FOR SELECT 
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'ATENCAO_CLIENTE'::app_role]));

-- Policy: Staff can insert messages
CREATE POLICY "Staff can insert messages" 
ON public.mensagens_cliente 
FOR INSERT 
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'ATENCAO_CLIENTE'::app_role]));