
-- Create junction table for beneficiary-titular many-to-many relationship
CREATE TABLE public.beneficiary_titular_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  titular_contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(beneficiary_contact_id, titular_contact_id)
);

-- Enable RLS
ALTER TABLE public.beneficiary_titular_links ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can view links"
ON public.beneficiary_titular_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert links"
ON public.beneficiary_titular_links FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete links"
ON public.beneficiary_titular_links FOR DELETE TO authenticated USING (true);

-- Migrate existing linked_principal_contact_id data into the new table
INSERT INTO public.beneficiary_titular_links (beneficiary_contact_id, titular_contact_id)
SELECT id, linked_principal_contact_id
FROM public.contacts
WHERE is_beneficiary = true AND linked_principal_contact_id IS NOT NULL
ON CONFLICT DO NOTHING;
