
-- Create payment_form enum
CREATE TYPE public.payment_form AS ENUM ('UNICO', 'PARCELADO');

-- Add payment_form column to payments table
ALTER TABLE public.payments ADD COLUMN payment_form public.payment_form DEFAULT 'UNICO';

-- Migrate existing PARCELAMENTO_MANUAL entries: set form to PARCELADO and method to OUTRO
UPDATE public.payments SET payment_form = 'PARCELADO' WHERE payment_method = 'PARCELAMENTO_MANUAL';
UPDATE public.payments SET payment_method = 'OUTRO' WHERE payment_method = 'PARCELAMENTO_MANUAL';
