-- case_notes: restringir SELECT a staff
DROP POLICY IF EXISTS "Staff can view all case notes" ON public.case_notes;
CREATE POLICY "Staff can view all case notes" ON public.case_notes
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role]));

DROP POLICY IF EXISTS "Staff can create case notes" ON public.case_notes;
CREATE POLICY "Staff can create case notes" ON public.case_notes
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role]) AND created_by_user_id = auth.uid());

-- huellas_reminders: restringir a staff
DROP POLICY IF EXISTS "Users can view huellas reminders" ON public.huellas_reminders;
CREATE POLICY "Staff can view huellas reminders" ON public.huellas_reminders
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'TECNICO'::app_role, 'ATENCAO_CLIENTE'::app_role]));

DROP POLICY IF EXISTS "Users can insert huellas reminders" ON public.huellas_reminders;
CREATE POLICY "Staff can insert huellas reminders" ON public.huellas_reminders
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'TECNICO'::app_role, 'ATENCAO_CLIENTE'::app_role]));

-- Realtime: restringir subscribe ao canal de mensagens_cliente para staff
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can subscribe to mensagens_cliente realtime" ON realtime.messages;
CREATE POLICY "Staff can subscribe to mensagens_cliente realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'DIRETORIA'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role])
  );