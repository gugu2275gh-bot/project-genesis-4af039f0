
CREATE TABLE public.payment_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country text NOT NULL CHECK (country IN ('BRASIL', 'ESPANHA')),
  account_name text NOT NULL,
  bank_name text,
  account_details text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by_user_id uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payment accounts"
ON public.payment_accounts FOR ALL
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'FINANCEIRO'::app_role]));

CREATE POLICY "Staff can view payment accounts"
ON public.payment_accounts FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'FINANCEIRO'::app_role, 'ATENCAO_CLIENTE'::app_role]));

CREATE TRIGGER update_payment_accounts_updated_at
BEFORE UPDATE ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
