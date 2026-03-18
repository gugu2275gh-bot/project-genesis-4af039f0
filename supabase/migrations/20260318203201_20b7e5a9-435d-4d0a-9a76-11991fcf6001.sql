-- Table to store extracted text from PDF knowledge base files
CREATE TABLE public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_path text NOT NULL,
  content text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid REFERENCES public.profiles(id),
  is_active boolean DEFAULT true
);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage knowledge base"
  ON public.knowledge_base FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Service can read active knowledge base"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (is_active = true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-base', 'knowledge-base', false);

CREATE POLICY "Admins can upload knowledge base files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'knowledge-base'
    AND public.has_role(auth.uid(), 'ADMIN')
  );

CREATE POLICY "Admins can read knowledge base files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'knowledge-base'
    AND public.has_role(auth.uid(), 'ADMIN')
  );

CREATE POLICY "Admins can delete knowledge base files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'knowledge-base'
    AND public.has_role(auth.uid(), 'ADMIN')
  );