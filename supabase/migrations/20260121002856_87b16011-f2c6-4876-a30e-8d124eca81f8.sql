-- Add installment fields to contracts
ALTER TABLE public.contracts 
ADD COLUMN installment_count INTEGER DEFAULT 1,
ADD COLUMN installment_amount NUMERIC,
ADD COLUMN first_due_date DATE,
ADD COLUMN cancellation_reason TEXT;

-- Add installment fields to payments
ALTER TABLE public.payments 
ADD COLUMN due_date DATE,
ADD COLUMN installment_number INTEGER;

-- Create payment_reminders table to track sent reminders
CREATE TABLE public.payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('D1', 'D3', 'D7', 'CANCELLED')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payment_id, reminder_type)
);

-- Create index for faster lookups
CREATE INDEX idx_payment_reminders_payment_id ON public.payment_reminders(payment_id);
CREATE INDEX idx_payments_due_date ON public.payments(due_date);
CREATE INDEX idx_payments_status_due_date ON public.payments(status, due_date);

-- Enable RLS
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_reminders
CREATE POLICY "Staff can view payment reminders"
ON public.payment_reminders
FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'ATENCAO_CLIENTE'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'JURIDICO'::app_role]));

CREATE POLICY "Service role can insert payment reminders"
ON public.payment_reminders
FOR INSERT
WITH CHECK (true);