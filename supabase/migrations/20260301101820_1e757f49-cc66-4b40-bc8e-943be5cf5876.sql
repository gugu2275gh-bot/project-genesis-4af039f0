
-- Register SUPERVISOR in user_profile_definitions
INSERT INTO public.user_profile_definitions (role_code, display_name, detailed_description, is_active, display_order)
VALUES ('SUPERVISOR', 'Supervisor', 'Perfil de supervisão com visibilidade total de leads e capacidade de redirecionar casos entre atendentes.', true, 3)
ON CONFLICT DO NOTHING;

-- ============================================
-- LEADS: Restrict visibility to assigned user
-- ============================================
DROP POLICY IF EXISTS "CRM staff can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Staff can view all leads" ON public.leads;

-- Supervisors/Admins/Managers: full access
CREATE POLICY "Supervisors can manage all leads"
ON public.leads FOR ALL
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role]));

-- Attendants: only their assigned leads
CREATE POLICY "Attendants can manage assigned leads"
ON public.leads FOR ALL
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role])
  AND assigned_to_user_id = auth.uid()
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role])
  AND assigned_to_user_id = auth.uid()
);

-- Legal: only leads with contracts
CREATE POLICY "Legal can view related leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'JURIDICO'::app_role)
  AND EXISTS (
    SELECT 1 FROM opportunities o
    JOIN contracts c ON c.opportunity_id = o.id
    WHERE o.lead_id = leads.id
  )
);

-- Finance: only leads with payments
CREATE POLICY "Finance can view related leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'FINANCEIRO'::app_role)
  AND EXISTS (
    SELECT 1 FROM opportunities o
    JOIN payments p ON p.opportunity_id = o.id
    WHERE o.lead_id = leads.id
  )
);

-- ============================================
-- MENSAGENS_CLIENTE: Restrict to assigned leads
-- ============================================
DROP POLICY IF EXISTS "Staff can view messages" ON public.mensagens_cliente;
DROP POLICY IF EXISTS "Staff can insert messages" ON public.mensagens_cliente;

CREATE POLICY "Supervisors can view all messages"
ON public.mensagens_cliente FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role]));

CREATE POLICY "Attendants can view assigned lead messages"
ON public.mensagens_cliente FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role])
  AND EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = mensagens_cliente.id_lead
    AND l.assigned_to_user_id = auth.uid()
  )
);

CREATE POLICY "Supervisors can insert messages"
ON public.mensagens_cliente FOR INSERT
TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role]));

CREATE POLICY "Attendants can insert assigned lead messages"
ON public.mensagens_cliente FOR INSERT
TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role])
  AND EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = mensagens_cliente.id_lead
    AND l.assigned_to_user_id = auth.uid()
  )
);

-- ============================================
-- CONTACTS: Add SUPERVISOR and ATENDENTE_WHATSAPP
-- ============================================
DROP POLICY IF EXISTS "Staff can manage contacts" ON public.contacts;
DROP POLICY IF EXISTS "Staff can view all contacts" ON public.contacts;

CREATE POLICY "Staff can manage contacts"
ON public.contacts FOR ALL
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'SUPERVISOR'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'SUPERVISOR'::app_role]));

CREATE POLICY "Staff can view all contacts"
ON public.contacts FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

-- ============================================
-- INTERACTIONS: Add SUPERVISOR and ATENDENTE_WHATSAPP
-- ============================================
DROP POLICY IF EXISTS "Staff can create interactions" ON public.interactions;
DROP POLICY IF EXISTS "Staff can view all interactions" ON public.interactions;

CREATE POLICY "Staff can create interactions"
ON public.interactions FOR INSERT
TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

CREATE POLICY "Staff can view all interactions"
ON public.interactions FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));
