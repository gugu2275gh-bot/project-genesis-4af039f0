UPDATE public.lead_funnel_state lfs
SET
  name_confirmed = CASE
    WHEN c.name_source IN ('USER_CONFIRMED','STAFF_EDITED') THEN true
    ELSE lfs.name_confirmed
  END,
  email_confirmed = CASE
    WHEN c.email IS NOT NULL AND c.email <> '' THEN true
    ELSE lfs.email_confirmed
  END,
  step = CASE
    WHEN lfs.step = 'nome' AND c.name_source IN ('USER_CONFIRMED','STAFF_EDITED')
      THEN CASE
        WHEN c.email IS NULL OR c.email = '' THEN 'email'
        WHEN lfs.interest_confirmed IS NULL THEN 'interesse'
        WHEN lfs.location_known IS NULL THEN 'localizacao'
        ELSE 'levantamento'
      END
    WHEN lfs.step = 'email' AND c.email IS NOT NULL AND c.email <> ''
      THEN CASE
        WHEN lfs.interest_confirmed IS NULL THEN 'interesse'
        WHEN lfs.location_known IS NULL THEN 'localizacao'
        ELSE 'levantamento'
      END
    ELSE lfs.step
  END,
  last_step_change = now(),
  updated_at = now()
FROM public.leads l
JOIN public.contacts c ON c.id = l.contact_id
WHERE lfs.lead_id = l.id
  AND (
    (c.name_source IN ('USER_CONFIRMED','STAFF_EDITED') AND lfs.name_confirmed = false)
    OR (c.email IS NOT NULL AND c.email <> '' AND lfs.email_confirmed = false)
  );