
-- Add approval workflow fields to commissions
ALTER TABLE public.commissions 
  ADD COLUMN approved_by_user_id uuid REFERENCES public.profiles(id),
  ADD COLUMN approved_at timestamp with time zone,
  ADD COLUMN rejection_reason text,
  ADD COLUMN reference_period text;

-- Update status default and migrate existing: PENDENTE_APROVACAO → APROVADA → PAGA
-- New statuses: PENDENTE_APROVACAO, APROVADA, PENDENTE, PAGA, REJEITADA, CANCELADA
-- Update existing PENDENTE to PENDENTE_APROVACAO
UPDATE public.commissions SET status = 'PENDENTE_APROVACAO' WHERE status = 'PENDENTE';
