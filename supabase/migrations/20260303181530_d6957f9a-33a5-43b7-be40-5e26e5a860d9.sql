-- Reset the sequence to start from 2865
ALTER SEQUENCE contract_number_seq RESTART WITH 2865;

-- Update the function to generate only sequential numbers (no prefix)
CREATE OR REPLACE FUNCTION public.generate_contract_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.contract_number IS NULL THEN
    NEW.contract_number := NEXTVAL('contract_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$function$;