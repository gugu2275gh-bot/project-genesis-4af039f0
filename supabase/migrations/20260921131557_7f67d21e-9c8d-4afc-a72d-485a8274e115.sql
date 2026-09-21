CREATE OR REPLACE FUNCTION public.create_pending_invoice_for_contract(
  p_contract_id uuid,
  p_created_by_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_next int;
  v_invoice_number text;
  v_existing_invoice_id uuid;
  v_contract public.contracts%rowtype;
  v_client_name text;
  v_client_document text;
  v_client_address text;
  v_service_description text;
  v_amount_no_vat numeric := 0;
  v_vat_rate numeric := 0.21;
  v_payment_count int := 0;
  v_tramite text;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id;

  IF v_contract.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_contract.status NOT IN ('APROVADO', 'ASSINADO') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_invoice_id
  FROM public.invoices
  WHERE contract_id = p_contract_id
    AND status <> 'CANCELADA'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    RETURN v_existing_invoice_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(p.amount), 0), COALESCE(MAX(p.vat_rate), 0.21)
    INTO v_payment_count, v_amount_no_vat, v_vat_rate
  FROM public.payments p
  WHERE p.contract_id = p_contract_id;

  IF v_payment_count = 0 OR COALESCE(v_amount_no_vat, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
    INTO v_client_name, v_client_document, v_client_address
  FROM public.contracts c
  JOIN public.opportunities o ON o.id = c.opportunity_id
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.contacts ct ON ct.id = l.contact_id
  WHERE c.id = p_contract_id
  LIMIT 1;

  IF v_client_name IS NULL THEN
    v_client_name := 'Cliente';
  END IF;

  SELECT st.name INTO v_tramite
  FROM public.contracts c
  JOIN public.opportunities o ON o.id = c.opportunity_id
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.service_types st ON st.id = l.service_type_id
  WHERE c.id = p_contract_id
  LIMIT 1;

  IF v_tramite IS NULL THEN
    SELECT st.name INTO v_tramite
    FROM public.contracts c
    JOIN public.service_types st ON st.code = c.service_type::text
    WHERE c.id = p_contract_id
    LIMIT 1;
  END IF;

  v_service_description := 'Serviços de assessoria - ' || COALESCE(v_tramite, 'Serviço');

  PERFORM pg_advisory_xact_lock(hashtext('invoice_number_' || v_year));

  SELECT COALESCE(
    MAX(NULLIF(split_part(invoice_number, '-', 2), '')::int),
    0
  ) + 1
  INTO v_next
  FROM public.invoices
  WHERE invoice_number LIKE v_year || '-%';

  v_invoice_number := v_year || '-' || lpad(v_next::text, 5, '0');

  INSERT INTO public.invoices (
    invoice_number, contract_id, payment_id,
    client_name, client_document, client_address,
    service_description, amount_without_vat, vat_rate, status,
    created_by_user_id
  ) VALUES (
    v_invoice_number, p_contract_id, NULL,
    v_client_name, v_client_document, v_client_address,
    v_service_description, ROUND(v_amount_no_vat, 2), COALESCE(v_vat_rate, 0.21), 'PENDENTE',
    p_created_by_user_id
  )
  RETURNING id INTO v_existing_invoice_id;

  RETURN v_existing_invoice_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_pending_invoice_for_contract(uuid, uuid) FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.auto_create_pending_invoice_on_contract_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('APROVADO', 'ASSINADO')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.create_pending_invoice_for_contract(NEW.id, NEW.updated_by_user_id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_create_pending_invoice_on_contract_approved() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_create_pending_invoice_on_contract_approved ON public.contracts;
CREATE TRIGGER trg_auto_create_pending_invoice_on_contract_approved
AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_pending_invoice_on_contract_approved();