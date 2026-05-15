CREATE OR REPLACE FUNCTION public.calculate_commission_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
BEGIN
  SELECT NULLIF(value, '')::numeric / 100
    INTO v_rate
  FROM public.system_config
  WHERE key = 'default_commission_rate';

  IF v_rate IS NULL THEN
    v_rate := 0.10;
  END IF;

  NEW.commission_rate := v_rate;
  NEW.commission_amount := COALESCE(NEW.base_amount, 0) * v_rate;
  RETURN NEW;
END;
$$;