
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS eu_entry_location text,
  ADD COLUMN IF NOT EXISTS has_eu_family_member boolean,
  ADD COLUMN IF NOT EXISTS works_remotely boolean,
  ADD COLUMN IF NOT EXISTS monthly_income numeric,
  ADD COLUMN IF NOT EXISTS has_admin_marketing_experience boolean,
  ADD COLUMN IF NOT EXISTS is_empadronado boolean,
  ADD COLUMN IF NOT EXISTS empadronamiento_since date,
  ADD COLUMN IF NOT EXISTS empadronamiento_city text,
  ADD COLUMN IF NOT EXISTS has_job_offer boolean;
