CREATE OR REPLACE FUNCTION public.sync_contact_is_in_spain()
RETURNS TRIGGER AS $$
DECLARE
  v_contact_id uuid;
  v_progress jsonb;
  v_a3 text;
  v_a4 text;
  v_a5 text;
  v_a6 text;
BEGIN
  SELECT contact_id INTO v_contact_id FROM public.leads WHERE id = NEW.lead_id;
  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.location_known = 'spain' THEN
    UPDATE public.contacts SET is_in_spain = true WHERE id = v_contact_id AND (is_in_spain IS DISTINCT FROM true);
  ELSIF NEW.location_known = 'outside' THEN
    UPDATE public.contacts SET is_in_spain = false WHERE id = v_contact_id AND (is_in_spain IS DISTINCT FROM false);
  END IF;

  IF NEW.entry_date_confirmed IS NOT NULL AND NEW.entry_date_confirmed ~ '^\d{4}-\d{2}-\d{2}$' THEN
    UPDATE public.contacts SET spain_arrival_date = NEW.entry_date_confirmed::date
    WHERE id = v_contact_id AND (spain_arrival_date IS DISTINCT FROM NEW.entry_date_confirmed::date);
  END IF;

  IF NEW.empadronado_confirmed IS NOT NULL THEN
    UPDATE public.contacts SET is_empadronado = NEW.empadronado_confirmed
    WHERE id = v_contact_id AND (is_empadronado IS DISTINCT FROM NEW.empadronado_confirmed);
  END IF;

  IF NEW.empadronado_city IS NOT NULL AND length(trim(NEW.empadronado_city)) > 0 THEN
    UPDATE public.contacts SET empadronamiento_city = NEW.empadronado_city
    WHERE id = v_contact_id AND (empadronamiento_city IS DISTINCT FROM NEW.empadronado_city);
  END IF;

  v_progress := COALESCE(NEW.outside_spain_progress, '{}'::jsonb);
  v_a3 := v_progress->>'a3_europe_6m';
  v_a4 := v_progress->>'a4_eu_family';
  v_a5 := v_progress->>'a5_remote';
  v_a6 := v_progress->>'a6_higher_ed';

  IF v_a3 IN ('yes','no') THEN
    UPDATE public.contacts SET eu_entry_last_6_months = (v_a3 = 'yes')
    WHERE id = v_contact_id AND (eu_entry_last_6_months IS DISTINCT FROM (v_a3 = 'yes'));
  END IF;
  IF v_a4 IN ('yes','no') THEN
    UPDATE public.contacts SET has_eu_family_member = (v_a4 = 'yes')
    WHERE id = v_contact_id AND (has_eu_family_member IS DISTINCT FROM (v_a4 = 'yes'));
  END IF;
  IF v_a5 IN ('yes','no') THEN
    UPDATE public.contacts SET works_remotely = (v_a5 = 'yes')
    WHERE id = v_contact_id AND (works_remotely IS DISTINCT FROM (v_a5 = 'yes'));
  END IF;
  IF v_a6 IN ('yes','no') THEN
    UPDATE public.contacts SET education_level = CASE WHEN v_a6 = 'yes' THEN 'SUPERIOR' ELSE NULL END
    WHERE id = v_contact_id AND (education_level IS DISTINCT FROM CASE WHEN v_a6 = 'yes' THEN 'SUPERIOR' ELSE NULL END);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE public.contacts c SET
  education_level = CASE WHEN (lfs.outside_spain_progress->>'a6_higher_ed') = 'yes' THEN 'SUPERIOR' ELSE c.education_level END
FROM public.leads l
JOIN public.lead_funnel_state lfs ON lfs.lead_id = l.id
WHERE l.contact_id = c.id
  AND (lfs.outside_spain_progress->>'a6_higher_ed') = 'yes'
  AND (c.education_level IS DISTINCT FROM 'SUPERIOR');