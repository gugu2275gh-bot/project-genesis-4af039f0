-- 1) Arquivo de mensagens
CREATE TABLE public.whatsapp_conversation_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_seq integer NOT NULL DEFAULT 1,
  phone text,
  lead_id uuid,
  contact_id uuid,
  contact_name text,
  direction text NOT NULL,
  body text,
  media_url text,
  media_type text,
  origem text,
  setor text,
  source_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_conversation_archive TO authenticated;
GRANT ALL ON public.whatsapp_conversation_archive TO service_role;

ALTER TABLE public.whatsapp_conversation_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestao pode ver arquivo de conversas"
ON public.whatsapp_conversation_archive FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA']::public.app_role[]));

CREATE INDEX idx_wca_session_phone_created ON public.whatsapp_conversation_archive (session_seq, phone, created_at);
CREATE INDEX idx_wca_created ON public.whatsapp_conversation_archive (created_at DESC);

-- 2) Campos identificados
CREATE TABLE public.whatsapp_conversation_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_seq integer NOT NULL DEFAULT 1,
  phone text,
  lead_id uuid,
  contact_id uuid,
  field_key text NOT NULL,
  field_label text,
  value_text text,
  value_raw jsonb,
  crm_target text,
  flow_id uuid,
  step_code text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_conversation_fields TO authenticated;
GRANT ALL ON public.whatsapp_conversation_fields TO service_role;

ALTER TABLE public.whatsapp_conversation_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestao pode ver campos identificados"
ON public.whatsapp_conversation_fields FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA']::public.app_role[]));

CREATE INDEX idx_wcf_session_phone ON public.whatsapp_conversation_fields (session_seq, phone, captured_at);
CREATE UNIQUE INDEX idx_wcf_unique ON public.whatsapp_conversation_fields (session_seq, phone, field_key, captured_at);

-- 3) Chaves de configuração
INSERT INTO public.system_config (key, value, description)
VALUES
  ('whatsapp_conversation_logging_enabled', 'true', 'Grava todas as conversas de WhatsApp em arquivo de auditoria (período de testes)'),
  ('whatsapp_conversation_log_session', '1', 'Contador da rodada de testes do arquivo de conversas')
ON CONFLICT (key) DO NOTHING;

-- 4) Função helper: rodada atual
CREATE OR REPLACE FUNCTION public.current_conversation_log_session()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(value, '')::integer, 1)
  FROM public.system_config WHERE key = 'whatsapp_conversation_log_session'
$$;

REVOKE EXECUTE ON FUNCTION public.current_conversation_log_session() FROM anon;

-- 5) Trigger de arquivamento
CREATE OR REPLACE FUNCTION public.archive_whatsapp_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_session integer;
  v_contact_id uuid;
  v_contact_name text;
  v_phone text;
BEGIN
  SELECT COALESCE(NULLIF(value, ''), 'false') = 'true' INTO v_enabled
  FROM public.system_config WHERE key = 'whatsapp_conversation_logging_enabled';

  IF COALESCE(v_enabled, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(value, '')::integer, 1) INTO v_session
  FROM public.system_config WHERE key = 'whatsapp_conversation_log_session';
  v_session := COALESCE(v_session, 1);

  IF NEW.id_lead IS NOT NULL THEN
    SELECT ct.id, ct.full_name, ct.phone
      INTO v_contact_id, v_contact_name, v_phone
    FROM public.leads l
    JOIN public.contacts ct ON ct.id = l.contact_id
    WHERE l.id = NEW.id_lead::uuid
    LIMIT 1;
  END IF;

  IF NEW.mensagem_cliente IS NOT NULL AND NEW.mensagem_cliente <> '' THEN
    INSERT INTO public.whatsapp_conversation_archive (
      session_seq, phone, lead_id, contact_id, contact_name, direction, body,
      media_url, media_type, origem, setor, source_message_id
    ) VALUES (
      v_session, v_phone, NEW.id_lead::uuid, v_contact_id, v_contact_name, 'INBOUND', NEW.mensagem_cliente,
      NEW.media_url, NEW.media_type, NEW.origem, NEW.setor, NEW.id::text
    );
  END IF;

  IF NEW."mensagem_IA" IS NOT NULL AND NEW."mensagem_IA" <> '' THEN
    INSERT INTO public.whatsapp_conversation_archive (
      session_seq, phone, lead_id, contact_id, contact_name, direction, body,
      media_url, media_type, origem, setor, source_message_id
    ) VALUES (
      v_session, v_phone, NEW.id_lead::uuid, v_contact_id, v_contact_name, 'OUTBOUND', NEW."mensagem_IA",
      NULL, NULL, NEW.origem, NEW.setor, NEW.id::text
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_whatsapp_message() FROM anon;

DROP TRIGGER IF EXISTS trg_archive_whatsapp_message ON public.mensagens_cliente;
CREATE TRIGGER trg_archive_whatsapp_message
AFTER INSERT ON public.mensagens_cliente
FOR EACH ROW EXECUTE FUNCTION public.archive_whatsapp_message();

-- 6) Limpeza de testes preserva a auditoria e avança a rodada
CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  results jsonb := '{}'::jsonb;
  tbl text;
  cnt bigint;
  v_new_session integer;
  tables_in_order text[] := ARRAY[
    'contract_reminders','document_reminders','huellas_reminders','initial_contact_reminders',
    'payment_reminders','requirement_reminders','tie_pickup_reminders',
    'reactivation_resolutions','chat_routing_logs','webhook_logs','log_webhooks_falhados',
    'whatsapp_template_logs','message_dedup','n8n_chat_histories','notifications','audit_logs',
    'commissions','invoices','cash_flow','payments',
    'contract_costs','contract_notes','contract_beneficiaries','contract_leads',
    'beneficiary_titular_links',
    'requirements_from_authority','service_documents','generated_documents','documents',
    'case_notes','service_cases',
    'tasks','interactions','portal_messages','mensagens_cliente',
    'customer_chat_context','customer_sector_pending_items',
    'nps_surveys','contact_data_suggestions',
    'contracts','opportunities','lead_intake','leads','contacts'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Apenas ADMIN pode executar limpeza';
  END IF;

  FOREACH tbl IN ARRAY tables_in_order LOOP
    EXECUTE format('DELETE FROM public.%I WHERE true', tbl);
    GET DIAGNOSTICS cnt = ROW_COUNT;
    results := results || jsonb_build_object(tbl, cnt);
  END LOOP;

  -- Auditoria de conversas NÃO é apagada: apenas avança a rodada de testes.
  UPDATE public.system_config
  SET value = (COALESCE(NULLIF(value, '')::integer, 1) + 1)::text
  WHERE key = 'whatsapp_conversation_log_session'
  RETURNING value::integer INTO v_new_session;

  IF v_new_session IS NULL THEN
    INSERT INTO public.system_config (key, value, description)
    VALUES ('whatsapp_conversation_log_session', '2', 'Contador da rodada de testes do arquivo de conversas')
    ON CONFLICT (key) DO NOTHING;
    v_new_session := 2;
  END IF;

  RETURN jsonb_build_object('success', true, 'results', results, 'conversation_log_session', v_new_session);
END;
$$;