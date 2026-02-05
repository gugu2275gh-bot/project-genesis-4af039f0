-- Tabela de superusuários
CREATE TABLE public.superusers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Habilitar RLS
ALTER TABLE public.superusers ENABLE ROW LEVEL SECURITY;

-- Função para verificar se usuário é superusuário
CREATE OR REPLACE FUNCTION public.is_superuser(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.superusers
    WHERE user_id = _user_id
  )
$$;

-- Política: Apenas superusuários podem ver a tabela
CREATE POLICY "Superusers can view superusers table"
ON public.superusers
FOR SELECT
TO authenticated
USING (public.is_superuser(auth.uid()));

-- Inserir os 4 superusuários baseado no email dos profiles
INSERT INTO public.superusers (user_id, email)
SELECT p.id, p.email 
FROM profiles p 
WHERE p.email IN (
  'paulohpl@icloud.com',
  'rvbarros@gmail.com', 
  'brenoluizsales@gmail.com',
  'gustavohb16@outlook.com'
);