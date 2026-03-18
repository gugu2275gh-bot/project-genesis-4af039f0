ALTER TABLE public.mensagens_cliente 
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_mimetype text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read whatsapp media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can insert whatsapp media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');