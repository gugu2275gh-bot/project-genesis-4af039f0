-- Create storage bucket for client documents
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);

-- RLS policies for client-documents bucket
CREATE POLICY "Clients can upload their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can view their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Staff can view all documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

CREATE POLICY "Staff can update documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

-- Create portal_messages table for client-staff communication
CREATE TABLE public.portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID REFERENCES public.service_cases(id),
  sender_user_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'staff')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for portal_messages
ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

-- Clients can view messages from their cases
CREATE POLICY "Clients can view their case messages"
ON public.portal_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_cases sc
    WHERE sc.id = portal_messages.service_case_id
    AND sc.client_user_id = auth.uid()
  )
);

-- Clients can send messages to their cases
CREATE POLICY "Clients can send messages to their cases"
ON public.portal_messages FOR INSERT
WITH CHECK (
  sender_user_id = auth.uid()
  AND sender_type = 'client'
  AND EXISTS (
    SELECT 1 FROM public.service_cases sc
    WHERE sc.id = portal_messages.service_case_id
    AND sc.client_user_id = auth.uid()
  )
);

-- Staff can view all messages
CREATE POLICY "Staff can view all portal messages"
ON public.portal_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

-- Staff can send messages
CREATE POLICY "Staff can send portal messages"
ON public.portal_messages FOR INSERT
WITH CHECK (
  sender_user_id = auth.uid()
  AND sender_type = 'staff'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

-- Staff can mark messages as read
CREATE POLICY "Staff can update portal messages"
ON public.portal_messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO')
  )
);

-- Add assigned_to_user_id to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID;

-- Create audit_logs table for tracking changes
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and managers can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER')
  )
);

-- System can insert audit logs (using service role)
CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);