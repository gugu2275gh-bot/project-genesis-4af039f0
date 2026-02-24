
-- Add missing fields to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS birth_city text,
  ADD COLUMN IF NOT EXISTS birth_state text,
  ADD COLUMN IF NOT EXISTS second_document_type text,
  ADD COLUMN IF NOT EXISTS second_document_number text,
  ADD COLUMN IF NOT EXISTS document_expiry_date date,
  ADD COLUMN IF NOT EXISTS legal_guardian_name text,
  ADD COLUMN IF NOT EXISTS legal_guardian_phone text,
  ADD COLUMN IF NOT EXISTS legal_guardian_email text,
  ADD COLUMN IF NOT EXISTS legal_guardian_address text,
  ADD COLUMN IF NOT EXISTS legal_guardian_birth_date date,
  ADD COLUMN IF NOT EXISTS legal_guardian_relationship text;
