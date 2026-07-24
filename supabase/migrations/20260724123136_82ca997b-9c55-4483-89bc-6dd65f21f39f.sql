
CREATE OR REPLACE FUNCTION public.create_manual_invoice_for_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_year text := to_char(now(), 'YYYY');
  v_next int;
  v_invoice_number text;
  v_client_name text;
  v_client_document text;
  v_client_address text;
  v_service_description text;
  v_amount_no_vat numeric;
  v_vat_rate numeric := 0.21;
  v_invoice_id uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado';
  END IF;
  IF v_payment.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'Só é possível emitir fatura de pagamentos confirmados';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE payment_id = p_payment_id) THEN
    RAISE EXCEPTION 'Já existe uma fatura emitida para este pagamento';
  END IF;

  IF v_payment.beneficiary_contact_id IS NOT NULL THEN
    SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
      INTO v_client_name, v_client_document, v_client_address
    FROM public.contacts ct
    WHERE ct.id = v_payment.beneficiary_contact_id;
  END IF;

  IF v_client_name IS NULL AND v_payment.contract_id IS NOT NULL THEN
    SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
      INTO v_client_name, v_client_document, v_client_address
    FROM public.contracts c
    JOIN public.opportunities o ON o.id = c.opportunity_id
    JOIN public.leads l ON l.id = o.lead_id
    JOIN public.contacts ct ON ct.id = l.contact_id
    WHERE c.id = v_payment.contract_id
    LIMIT 1;
  END IF;

  IF v_client_name IS NULL AND v_payment.opportunity_id IS NOT NULL THEN
    SELECT ct.full_name, COALESCE(ct.document_number, ct.cpf), ct.address
      INTO v_client_name, v_client_document, v_client_address
    FROM public.opportunities o
    JOIN public.leads l ON l.id = o.lead_id
    JOIN public.contacts ct ON ct.id = l.contact_id
    WHERE o.id = v_payment.opportunity_id
    LIMIT 1;
  END IF;

  IF v_client_name IS NULL THEN
    v_client_name := 'Cliente';
  END IF;

  IF v_payment.contract_id IS NOT NULL THEN
    SELECT format(
      'Parcela %s - Contrato %s',
      COALESCE(v_payment.installment_number::text, '1'),
      COALESCE(c.contract_number, c.id::text)
    )
    INTO v_service_description
    FROM public.contracts c
    WHERE c.id = v_payment.contract_id;
  END IF;

  v_service_description := COALESCE(v_service_description, 'Pagamento avulso');

  IF COALESCE(v_payment.vat_rate, 0) > 0 THEN
    v_vat_rate := v_payment.vat_rate;
  END IF;

  v_amount_no_vat := ROUND(v_payment.amount / (1 + v_vat_rate), 2);

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
    v_invoice_number, v_payment.contract_id, v_payment.id,
    v_client_name, v_client_document, v_client_address,
    v_service_description, v_amount_no_vat, v_vat_rate, 'EMITIDA'
  )
  RETURNING id INTO v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_invoice_for_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_invoice_for_payment(uuid) TO authenticated, service_role;
