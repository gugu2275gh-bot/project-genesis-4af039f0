CREATE OR REPLACE FUNCTION public.prevent_duplicate_single_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_form::text, 'UNICO') <> 'UNICO' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status::text, '') = 'ESTORNADO' THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_existing_id
  FROM public.payments p
  WHERE p.id <> NEW.id
    AND p.contract_id = NEW.contract_id
    AND COALESCE(p.payment_form::text, 'UNICO') = 'UNICO'
    AND COALESCE(p.status::text, '') <> 'ESTORNADO'
    AND p.opportunity_id IS NOT DISTINCT FROM NEW.opportunity_id
    AND p.beneficiary_contact_id IS NOT DISTINCT FROM NEW.beneficiary_contact_id
    AND p.due_date IS NOT DISTINCT FROM NEW.due_date
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um pagamento único ativo para este serviço neste contrato com o mesmo vencimento (pagamento %). Edite o pagamento existente em vez de criar outro.', v_existing_id
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_duplicate_single_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_single_payment() TO service_role;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_single_payment ON public.payments;
CREATE TRIGGER trg_prevent_duplicate_single_payment
BEFORE INSERT OR UPDATE OF contract_id, opportunity_id, beneficiary_contact_id, payment_form, due_date, status
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_single_payment();