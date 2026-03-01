
-- Add beneficiary_contact_id to payments to track which beneficiary a payment is for
ALTER TABLE public.payments
ADD COLUMN beneficiary_contact_id uuid REFERENCES public.contacts(id);

-- Index for fast lookups
CREATE INDEX idx_payments_beneficiary_contact_id ON public.payments(beneficiary_contact_id);

-- Comment
COMMENT ON COLUMN public.payments.beneficiary_contact_id IS 'Optional: links this payment installment to a specific beneficiary contact';
