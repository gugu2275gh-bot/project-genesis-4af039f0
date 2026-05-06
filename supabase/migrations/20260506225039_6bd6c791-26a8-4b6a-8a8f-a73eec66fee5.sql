
-- Restrict public INSERT policies to service_role only

-- contact_data_suggestions
DROP POLICY IF EXISTS "System can insert suggestions" ON public.contact_data_suggestions;
CREATE POLICY "Service role can insert suggestions"
  ON public.contact_data_suggestions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- initial_contact_reminders
DROP POLICY IF EXISTS "Service role can insert reminders" ON public.initial_contact_reminders;
CREATE POLICY "Service role can insert reminders"
  ON public.initial_contact_reminders
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- lead_intake
DROP POLICY IF EXISTS "System can insert lead intakes" ON public.lead_intake;
CREATE POLICY "Service role can insert lead intakes"
  ON public.lead_intake
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- whatsapp_templates: restrict reads to staff
DROP POLICY IF EXISTS "Authenticated can read whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Staff can read whatsapp templates"
  ON public.whatsapp_templates
  FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role, 'DIRETORIA'::app_role]));

-- tie_pickup_reminders: restrict reads to staff
DROP POLICY IF EXISTS "Authenticated users can view tie_pickup_reminders" ON public.tie_pickup_reminders;
CREATE POLICY "Staff can view tie_pickup_reminders"
  ON public.tie_pickup_reminders
  FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'TECNICO'::app_role, 'ATENCAO_CLIENTE'::app_role, 'EXPEDIENTE'::app_role, 'DIRETORIA'::app_role]));

-- service_document_types: restrict reads to authenticated
DROP POLICY IF EXISTS "Anyone can view document types" ON public.service_document_types;
CREATE POLICY "Authenticated users can view document types"
  ON public.service_document_types
  FOR SELECT
  TO authenticated
  USING (true);

-- knowledge_base: restrict reads to staff roles only
DROP POLICY IF EXISTS "Service can read active knowledge base" ON public.knowledge_base;
CREATE POLICY "Staff can read active knowledge base"
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (is_active = true AND has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role, 'DIRETORIA'::app_role]));
