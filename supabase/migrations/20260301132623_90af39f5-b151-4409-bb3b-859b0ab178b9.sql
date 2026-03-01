
-- Add beneficiary fields to contacts table
ALTER TABLE public.contacts 
ADD COLUMN is_beneficiary boolean NOT NULL DEFAULT false,
ADD COLUMN linked_principal_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
