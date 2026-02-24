
-- Add contact_id to contract_beneficiaries to link beneficiaries to contacts
ALTER TABLE public.contract_beneficiaries
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_contract_beneficiaries_contact_id 
  ON public.contract_beneficiaries(contact_id);
