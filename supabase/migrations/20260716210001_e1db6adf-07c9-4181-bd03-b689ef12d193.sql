
CREATE OR REPLACE FUNCTION public.auto_create_invoice_on_payment_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- só reage à transição para CONFIRMADO
  IF NEW.status <> 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;
  IF NEW.contract_id IS NULL OR COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- se já existe fatura para essa parcela, não duplica
  IF EXISTS (SELECT 1 FROM public.invoices WHERE payment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- dados do cliente (beneficiário da parcela; fallback ao titular do contrato)
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

  -- descrição do serviço: "Parcela X/Y - Contrato N"
  SELECT format(
    'Parcela %s%s - Contrato %s',
    COALESCE(NEW.installment_number::text, '1'),
    CASE WHEN c.total_installments IS NOT NULL AND c.total_installments > 0
         THEN '/' || c.total_installments::text ELSE '' END,
    COALESCE(c.contract_number, c.id::text)
  )
  INTO v_service_description
  FROM public.contracts c
  WHERE c.id = NEW.contract_id;

  v_service_description := COALESCE(v_service_description, 'Parcela de contrato');

  -- IVA extraído do valor da parcela (base + 21% = valor total)
  v_amount_no_vat := ROUND(NEW.amount / (1 + v_vat_rate), 2);

  -- número sequencial YYYY-NNNNN (bloqueia concorrência via advisory lock)
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
$$;

DROP TRIGGER IF EXISTS trg_auto_create_invoice_on_payment_confirmed ON public.payments;

CREATE TRIGGER trg_auto_create_invoice_on_payment_confirmed
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_invoice_on_payment_confirmed();
