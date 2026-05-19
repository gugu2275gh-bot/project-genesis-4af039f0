-- 1. Add explicit "is in Spain" flag on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_in_spain boolean;

-- 2. Backfill from existing funnel state (latest known per contact)
UPDATE public.contacts c
SET is_in_spain = sub.is_in_spain
FROM (
  SELECT DISTINCT ON (l.contact_id)
    l.contact_id,
    CASE
      WHEN lfs.location_known = 'spain' THEN true
      WHEN lfs.location_known = 'outside' THEN false
      ELSE NULL
    END AS is_in_spain
  FROM public.lead_funnel_state lfs
  JOIN public.leads l ON l.id = lfs.lead_id
  WHERE lfs.location_known IN ('spain', 'outside')
  ORDER BY l.contact_id, lfs.updated_at DESC
) sub
WHERE c.id = sub.contact_id
  AND c.is_in_spain IS DISTINCT FROM sub.is_in_spain;

-- Also infer from existing data: if spain_arrival_date or is_empadronado=true, then in Spain
UPDATE public.contacts
SET is_in_spain = true
WHERE is_in_spain IS NULL
  AND (spain_arrival_date IS NOT NULL OR is_empadronado = true);

-- 3. Trigger: when funnel sets location_known, mirror to contacts.is_in_spain
CREATE OR REPLACE FUNCTION public.sync_contact_is_in_spain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_value boolean;
BEGIN
  IF NEW.location_known IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.location_known IS NOT DISTINCT FROM OLD.location_known THEN
    RETURN NEW;
  END IF;

  IF NEW.location_known = 'spain' THEN
    v_value := true;
  ELSIF NEW.location_known = 'outside' THEN
    v_value := false;
  ELSE
    RETURN NEW;
  END IF;

  SELECT contact_id INTO v_contact_id FROM public.leads WHERE id = NEW.lead_id;
  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.contacts
  SET is_in_spain = v_value,
      updated_at = now()
  WHERE id = v_contact_id
    AND (is_in_spain IS DISTINCT FROM v_value);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contact_is_in_spain ON public.lead_funnel_state;
CREATE TRIGGER trg_sync_contact_is_in_spain
AFTER INSERT OR UPDATE OF location_known ON public.lead_funnel_state
FOR EACH ROW
EXECUTE FUNCTION public.sync_contact_is_in_spain();