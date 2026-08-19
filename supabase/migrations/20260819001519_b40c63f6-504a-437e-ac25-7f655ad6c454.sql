CREATE OR REPLACE FUNCTION public.auto_create_cashflow_on_commission_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists uuid;
BEGIN
  IF NEW.status = 'PAGA' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') <> 'PAGA') THEN
    SELECT id INTO v_exists FROM public.cash_flow WHERE related_commission_id = NEW.id LIMIT 1;
    IF v_exists IS NULL THEN
      INSERT INTO public.cash_flow (
        type, category, subcategory, description, amount,
        payment_method, reference_date, payment_date,
        related_contract_id, related_commission_id, created_by_user_id
      ) VALUES (
        'SAIDA',
        'DESPESA_VARIAVEL',
        'Comissões Pagas',
        'Comissão - ' || NEW.collaborator_name,
        COALESCE(NEW.commission_amount, 0),
        NEW.payment_method,
        COALESCE(NEW.paid_at::date, CURRENT_DATE),
        COALESCE(NEW.paid_at::date, CURRENT_DATE),
        NEW.contract_id,
        NEW.id,
        NEW.created_by_user_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_create_cashflow_on_commission_paid() FROM PUBLIC, anon, authenticated;