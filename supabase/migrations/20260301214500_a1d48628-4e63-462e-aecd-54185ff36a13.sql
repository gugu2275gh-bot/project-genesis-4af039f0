
-- Add discount and VAT fields to payments table
ALTER TABLE public.payments
  ADD COLUMN gross_amount numeric NULL,
  ADD COLUMN discount_type text NULL CHECK (discount_type IN ('PERCENTUAL', 'VALOR')),
  ADD COLUMN discount_value numeric NULL DEFAULT 0,
  ADD COLUMN apply_vat boolean NULL DEFAULT false,
  ADD COLUMN vat_rate numeric NULL DEFAULT 0.21,
  ADD COLUMN vat_amount numeric NULL DEFAULT 0;
