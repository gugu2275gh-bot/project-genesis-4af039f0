
-- Drop duplicate trigger
DROP TRIGGER IF EXISTS trigger_calculate_commission ON public.commissions;

-- Update the trigger function to respect vat_enabled and preserve manually set amounts
CREATE OR REPLACE FUNCTION public.calculate_commission_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric;
  v_base_commission numeric;
  v_expected numeric;
BEGIN
  SELECT NULLIF(value, '')::numeric / 100
    INTO v_rate
  FROM public.system_config
  WHERE key = 'default_commission_rate';

  IF v_rate IS NULL THEN
    v_rate := 0.10;
  END IF;

  -- Preserve a per-row commission_rate if one was supplied; otherwise use system default
  IF NEW.commission_rate IS NULL OR NEW.commission_rate = 0 THEN
    NEW.commission_rate := v_rate;
  END IF;

  v_base_commission := COALESCE(NEW.base_amount, 0) * COALESCE(NEW.commission_rate, v_rate);
  v_expected := ROUND(v_base_commission * CASE WHEN COALESCE(NEW.vat_enabled, false) THEN 1.21 ELSE 1 END, 2);

  -- Only auto-fill commission_amount when the caller did not provide a valid value.
  -- If caller explicitly set commission_amount (e.g. VAT toggle), respect it.
  IF NEW.commission_amount IS NULL OR NEW.commission_amount = 0 THEN
    NEW.commission_amount := v_expected;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recalculate current record(s) that were saved with vat_enabled=true but base amount only
UPDATE public.commissions
SET commission_amount = ROUND(base_amount * COALESCE(commission_rate, 0.10) * 1.21, 2)
WHERE vat_enabled = true
  AND commission_amount = ROUND(base_amount * COALESCE(commission_rate, 0.10), 2);
