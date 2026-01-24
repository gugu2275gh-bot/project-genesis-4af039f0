-- CORREÇÃO DE SEGURANÇA: RLS e Search Path

-- Corrigir funções com search_path
CREATE OR REPLACE FUNCTION calculate_commission_amount()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.has_invoice THEN
    NEW.commission_rate := 0.10;
  ELSE
    NEW.commission_rate := 0.08;
  END IF;
  NEW.commission_amount := NEW.base_amount * NEW.commission_rate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.vat_amount := NEW.amount_without_vat * COALESCE(NEW.vat_rate, 0.21);
  NEW.total_amount := NEW.amount_without_vat + NEW.vat_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;