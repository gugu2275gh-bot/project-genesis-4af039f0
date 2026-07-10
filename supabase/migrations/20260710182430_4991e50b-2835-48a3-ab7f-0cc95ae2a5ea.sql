
ALTER TABLE public.cash_flow
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_confirmed_date date,
  ADD COLUMN IF NOT EXISTS payment_method text;
