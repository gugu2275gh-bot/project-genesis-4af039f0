
CREATE OR REPLACE FUNCTION public.sync_contact_is_in_spain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id uuid;
  v_value boolean;
  v_date date;
BEGIN
  SELECT contact_id INTO v_contact_id FROM public.leads WHERE id = NEW.lead_id;
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sync is_in_spain from location_known
  IF NEW.location_known IS NOT NULL THEN
    IF NEW.location_known = 'spain' THEN v_value := true;
    ELSIF NEW.location_known = 'outside' THEN v_value := false;
    ELSE v_value := NULL;
    END IF;
    IF v_value IS NOT NULL THEN
      UPDATE public.contacts SET is_in_spain = v_value, updated_at = now()
      WHERE id = v_contact_id AND (is_in_spain IS DISTINCT FROM v_value);
    END IF;
  END IF;

  -- Sync spain_arrival_date from entry_date_confirmed
  IF NEW.entry_date_confirmed IS NOT NULL
     AND NEW.entry_date_confirmed ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_date := NEW.entry_date_confirmed::date;
      UPDATE public.contacts SET spain_arrival_date = v_date, updated_at = now()
      WHERE id = v_contact_id AND (spain_arrival_date IS DISTINCT FROM v_date);
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  -- Sync is_empadronado from empadronado_confirmed
  IF NEW.empadronado_confirmed IS NOT NULL THEN
    UPDATE public.contacts SET is_empadronado = NEW.empadronado_confirmed, updated_at = now()
    WHERE id = v_contact_id AND (is_empadronado IS DISTINCT FROM NEW.empadronado_confirmed);
  END IF;

  -- Sync empadronamiento_city from empadronado_city
  IF NEW.empadronado_city IS NOT NULL AND length(trim(NEW.empadronado_city)) > 0 THEN
    UPDATE public.contacts SET empadronamiento_city = NEW.empadronado_city, updated_at = now()
    WHERE id = v_contact_id AND (empadronamiento_city IS DISTINCT FROM NEW.empadronado_city);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_contact_is_in_spain ON public.lead_funnel_state;
CREATE TRIGGER trg_sync_contact_is_in_spain
AFTER INSERT OR UPDATE OF location_known, entry_date_confirmed, empadronado_confirmed, empadronado_city
ON public.lead_funnel_state
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_is_in_spain();

-- Backfill
UPDATE public.contacts c
SET is_empadronado = lfs.empadronado_confirmed,
    updated_at = now()
FROM public.leads l
JOIN public.lead_funnel_state lfs ON lfs.lead_id = l.id
WHERE l.contact_id = c.id
  AND lfs.empadronado_confirmed IS NOT NULL
  AND c.is_empadronado IS DISTINCT FROM lfs.empadronado_confirmed;

UPDATE public.contacts c
SET empadronamiento_city = lfs.empadronado_city,
    updated_at = now()
FROM public.leads l
JOIN public.lead_funnel_state lfs ON lfs.lead_id = l.id
WHERE l.contact_id = c.id
  AND lfs.empadronado_city IS NOT NULL
  AND length(trim(lfs.empadronado_city)) > 0
  AND c.empadronamiento_city IS DISTINCT FROM lfs.empadronado_city;
