CREATE OR REPLACE FUNCTION public.calculate_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  extras numeric := 0;
BEGIN
  IF NEW.additional_costs IS NOT NULL AND jsonb_typeof(NEW.additional_costs) = 'object' THEN
    SELECT COALESCE(SUM(value::numeric), 0)
    INTO extras
    FROM jsonb_each_text(NEW.additional_costs);
  END IF;

  -- IVA calculado apenas sobre o valor do serviço (taxas não entram no cálculo)
  NEW.vat_amount := NEW.amount_without_vat * COALESCE(NEW.vat_rate, 0.21);
  NEW.total_amount := NEW.amount_without_vat + NEW.vat_amount + extras;
  RETURN NEW;
END;
$$;