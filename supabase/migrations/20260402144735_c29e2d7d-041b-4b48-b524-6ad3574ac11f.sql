ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'twilio/text',
  ADD COLUMN IF NOT EXISTS header_text text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS buttons jsonb DEFAULT '[]'::jsonb;