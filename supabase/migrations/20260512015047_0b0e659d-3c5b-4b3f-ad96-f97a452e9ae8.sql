
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  document TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can view suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'MANAGER') OR has_role(auth.uid(), 'FINANCEIRO')
);

CREATE POLICY "Finance roles can insert suppliers"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'MANAGER') OR has_role(auth.uid(), 'FINANCEIRO')
);

CREATE POLICY "Finance roles can update suppliers"
ON public.suppliers FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'MANAGER') OR has_role(auth.uid(), 'FINANCEIRO')
);

CREATE POLICY "Finance roles can delete suppliers"
ON public.suppliers FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN') OR has_role(auth.uid(), 'MANAGER') OR has_role(auth.uid(), 'FINANCEIRO')
);

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
