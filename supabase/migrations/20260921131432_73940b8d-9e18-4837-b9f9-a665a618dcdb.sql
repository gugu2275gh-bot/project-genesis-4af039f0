REVOKE EXECUTE ON FUNCTION public.create_pending_invoice_for_contract(uuid, uuid) FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.auto_create_pending_invoice_on_contract_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_status text;
  v_created_by uuid;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status::text, updated_by_user_id
    INTO v_contract_status, v_created_by
  FROM public.contracts
  WHERE id = NEW.contract_id;

  IF v_contract_status IN ('APROVADO', 'ASSINADO') THEN
    PERFORM public.create_pending_invoice_for_contract(NEW.contract_id, v_created_by);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_create_pending_invoice_on_contract_payment() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_create_pending_invoice_on_contract_payment ON public.payments;
CREATE TRIGGER trg_auto_create_pending_invoice_on_contract_payment
AFTER INSERT OR UPDATE OF contract_id, payment_account_id, amount ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_pending_invoice_on_contract_payment();