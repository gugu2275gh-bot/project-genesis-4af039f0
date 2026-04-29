
-- Atualiza políticas RLS: cada usuário vê suas ações; Admin/Manager vê todas
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Users view own audit logs"
ON public.audit_logs FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER']::app_role[])
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);

-- ============================================================
-- TRIGGER GENÉRICO: contratos
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_contract_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, new_data)
    VALUES (
      auth.uid(), 'contracts', NEW.id::text, 'CREATE',
      jsonb_build_object(
        'contract_number', NEW.contract_number,
        'status', NEW.status,
        'total_fee', NEW.total_fee
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (
      auth.uid(), 'contracts', NEW.id::text, 'STATUS_CHANGE',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status,
        'contract_number', NEW.contract_number
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data)
    VALUES (
      auth.uid(), 'contracts', OLD.id::text, 'DELETE',
      jsonb_build_object(
        'contract_number', OLD.contract_number,
        'status', OLD.status
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_contract_changes ON public.contracts;
CREATE TRIGGER trg_log_contract_changes
AFTER INSERT OR UPDATE OR DELETE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.log_contract_changes();

-- ============================================================
-- TRIGGER: pagamentos
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_payment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, new_data)
    VALUES (
      auth.uid(), 'payments', NEW.id::text, 'CREATE',
      jsonb_build_object(
        'contract_id', NEW.contract_id,
        'amount', NEW.amount,
        'installment_number', NEW.installment_number,
        'status', NEW.status,
        'beneficiary_contact_id', NEW.beneficiary_contact_id
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (
      auth.uid(), 'payments', NEW.id::text, 'STATUS_CHANGE',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status,
        'contract_id', NEW.contract_id,
        'amount', NEW.amount,
        'installment_number', NEW.installment_number
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data)
    VALUES (
      auth.uid(), 'payments', OLD.id::text, 'DELETE',
      jsonb_build_object(
        'contract_id', OLD.contract_id,
        'amount', OLD.amount,
        'installment_number', OLD.installment_number,
        'status', OLD.status
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_changes ON public.payments;
CREATE TRIGGER trg_log_payment_changes
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.log_payment_changes();

-- ============================================================
-- TRIGGER: leads (status changes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_lead_status_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (
      auth.uid(), 'leads', NEW.id::text, 'STATUS_CHANGE',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status,
        'contact_id', NEW.contact_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_status_changes ON public.leads;
CREATE TRIGGER trg_log_lead_status_changes
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_status_changes();
