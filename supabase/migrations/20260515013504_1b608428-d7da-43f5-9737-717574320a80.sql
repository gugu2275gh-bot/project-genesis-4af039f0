ALTER TABLE public.expense_categories 
ADD COLUMN IF NOT EXISTS flow text NOT NULL DEFAULT 'SAIDA' 
CHECK (flow IN ('ENTRADA', 'SAIDA'));