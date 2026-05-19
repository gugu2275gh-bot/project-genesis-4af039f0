-- Extend sync trigger to also propagate spain_arrival_date from lead_funnel_state.entry_date_confirmed
CREATE OR REPLACE FUNCTION public.sync_contact_is_in_spain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF NEW.location_known = 'spain' THEN
      v_value := true;
    ELSIF NEW.location_known = 'outside' THEN
      v_value := false;
    ELSE
      v_value := NULL;
    END IF;

    IF v_value IS NOT NULL THEN
      UPDATE public.contacts
      SET is_in_spain = v_value,
          updated_at = now()
      WHERE id = v_contact_id
        AND (is_in_spain IS DISTINCT FROM v_value);
    END IF;
  END IF;

  -- Sync spain_arrival_date from entry_date_confirmed (only if it matches YYYY-MM-DD)
  IF NEW.entry_date_confirmed IS NOT NULL
     AND NEW.entry_date_confirmed ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_date := NEW.entry_date_confirmed::date;
      UPDATE public.contacts
      SET spain_arrival_date = v_date,
          updated_at = now()
      WHERE id = v_contact_id
        AND (spain_arrival_date IS DISTINCT FROM v_date);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger to listen on both columns
DROP TRIGGER IF EXISTS trg_sync_contact_is_in_spain ON public.lead_funnel_state;
CREATE TRIGGER trg_sync_contact_is_in_spain
AFTER INSERT OR UPDATE OF location_known, entry_date_confirmed
ON public.lead_funnel_state
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_is_in_spain();

-- Backfill existing data
WITH latest AS (
  SELECT DISTINCT ON (l.contact_id)
    l.contact_id,
    lfs.location_known,
    lfs.entry_date_confirmed
  FROM public.lead_funnel_state lfs
  JOIN public.leads l ON l.id = lfs.lead_id
  ORDER BY l.contact_id, lfs.updated_at DESC
)
UPDATE public.contacts c
SET
  is_in_spain = CASE
    WHEN latest.location_known = 'spain' THEN true
    WHEN latest.location_known = 'outside' THEN false
    ELSE c.is_in_spain
  END,
  spain_arrival_date = CASE
    WHEN latest.entry_date_confirmed ~ '^\d{4}-\d{2}-\d{2}$'
      AND c.spain_arrival_date IS NULL
      THEN latest.entry_date_confirmed::date
    ELSE c.spain_arrival_date
  END,
  updated_at = now()
FROM latest
WHERE c.id = latest.contact_id
  AND (
    (latest.location_known IN ('spain','outside') AND c.is_in_spain IS DISTINCT FROM (latest.location_known = 'spain'))
    OR (latest.entry_date_confirmed ~ '^\d{4}-\d{2}-\d{2}$' AND c.spain_arrival_date IS NULL)
  );