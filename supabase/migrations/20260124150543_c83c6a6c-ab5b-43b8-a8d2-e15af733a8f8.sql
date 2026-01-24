-- Create contract_costs table for tracking case expenses
CREATE TABLE public.contract_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL,
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup by contract
CREATE INDEX idx_contract_costs_contract_id ON public.contract_costs(contract_id);

-- Enable RLS
ALTER TABLE public.contract_costs ENABLE ROW LEVEL SECURITY;

-- Staff can view contract costs
CREATE POLICY "Staff can view contract costs" ON public.contract_costs
  FOR SELECT USING (
    has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'JURIDICO', 'FINANCEIRO', 'TECNICO']::app_role[])
  );

-- Legal and Finance can manage contract costs
CREATE POLICY "Legal and Finance can manage contract costs" ON public.contract_costs
  FOR ALL USING (
    has_any_role(auth.uid(), ARRAY['ADMIN', 'JURIDICO', 'FINANCEIRO']::app_role[])
  );