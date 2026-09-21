CREATE OR REPLACE FUNCTION public.auto_create_pending_invoice_on_contract_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('APROVADO', 'ASSINADO')
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
     )
     AND EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.contract_id = NEW.id
     ) THEN
    PERFORM public.create_pending_invoice_for_contract(NEW.id, NEW.updated_by_user_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_create_pending_invoice_on_contract_approved() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_pending_invoice_on_contract_approved() TO service_role;