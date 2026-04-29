ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view documents" ON public.documents;
CREATE POLICY "Admins can view documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role));