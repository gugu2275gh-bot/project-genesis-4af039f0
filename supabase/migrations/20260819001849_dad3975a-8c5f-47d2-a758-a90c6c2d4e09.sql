CREATE OR REPLACE FUNCTION public.auto_create_invoice_on_payment_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_next int;
  v_invoice_number text;
  v_client_name text;
  v_client_document text;
  v_client_address text;
  v_service_description text;
  v_amount_no_vat numeric;
  v_vat_rate numeric := 0.21;
  v_issues_invoice boolean;
  v_total_installments int;
  v_tramite text;
BEGIN
  IF NEW.status <> 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_id IS NULL OR COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT issues_invoice INTO v_issues_invoice
  FROM public.payment_accounts
  WHERE id = NEW.payment_account_id;

  IF COALESCE(v_issues_invoice, false) = false THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
    INTO v_client_name, v_client_document, v_client_address
  FROM public.contacts ct
  WHERE ct.id = NEW.beneficiary_contact_id;

  IF v_client_name IS NULL THEN
    SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
      INTO v_client_name, v_client_document, v_client_address
    FROM public.contracts c
    JOIN public.opportunities o ON o.id = c.opportunity_id
    JOIN public.leads l ON l.id = o.lead_id
    JOIN public.contacts ct ON ct.id = l.contact_id
    WHERE c.id = NEW.contract_id
    LIMIT 1;
  END IF;

  IF v_client_name IS NULL THEN
    v_client_name := 'Cliente';
  END IF;

  -- Trâmite (serviço) do contrato
  SELECT st.name INTO v_tramite
  FROM public.contracts c
  JOIN public.opportunities o ON o.id = COALESCE(NEW.opportunity_id, c.opportunity_id)
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.service_types st ON st.id = l.service_type_id
  WHERE c.id = NEW.contract_id
  LIMIT 1;

  IF v_tramite IS NULL THEN
    SELECT st.name INTO v_tramite
    FROM public.contracts c
    JOIN public.service_types st ON st.code = c.service_type::text
    WHERE c.id = NEW.contract_id
    LIMIT 1;
  END IF;

  SELECT COUNT(*) INTO v_total_installments
  FROM public.payments
  WHERE contract_id = NEW.contract_id
    AND COALESCE(opportunity_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(NEW.opportunity_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_service_description := format(
    'Parcela %s%s - %s',
    COALESCE(NEW.installment_number::text, '1'),
    CASE WHEN v_total_installments IS NOT NULL AND v_total_installments > 0
         THEN '/' || v_total_installments::text ELSE '' END,
    COALESCE(v_tramite, 'Serviço')
  );

  v_amount_no_vat := ROUND(NEW.amount, 2);

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
    service_description, amount_without_vat, vat_rate, status
  ) VALUES (
    v_invoice_number, NEW.contract_id, NEW.id,
    v_client_name, v_client_document, v_client_address,
    v_service_description, v_amount_no_vat, v_vat_rate, 'EMITIDA'
  );

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_create_invoice_on_payment_confirmed() FROM anon, authenticated, PUBLIC;

-- Atualizar faturas existentes: trocar "Contrato N" pelo nome do trâmite
UPDATE public.invoices i
SET service_description = regexp_replace(i.service_description, ' - Contrato .*$', ' - ' || t.name)
FROM (
  SELECT c.id AS contract_id, st.name
  FROM public.contracts c
  JOIN public.opportunities o ON o.id = c.opportunity_id
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.service_types st ON st.id = l.service_type_id
) t
WHERE t.contract_id = i.contract_id
  AND i.service_description LIKE '% - Contrato %';