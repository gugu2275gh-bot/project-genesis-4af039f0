CREATE TABLE public.llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  gemini_enabled boolean NOT NULL DEFAULT true,
  openai_enabled boolean NOT NULL DEFAULT true,
  cascade jsonb NOT NULL DEFAULT '[
    {"provider":"gemini","model":"gemini-3.5-flash","enabled":true},
    {"provider":"gemini","model":"gemini-2.5-pro","enabled":true},
    {"provider":"gemini","model":"gemini-2.5-flash-lite","enabled":true},
    {"provider":"openai","model":"gpt-4o-mini","enabled":true}
  ]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.llm_settings TO authenticated;
GRANT ALL ON public.llm_settings TO service_role;

ALTER TABLE public.llm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view llm settings"
ON public.llm_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Admins can insert llm settings"
ON public.llm_settings FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Admins can update llm settings"
ON public.llm_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'))
WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE TRIGGER trg_llm_settings_updated_at
BEFORE UPDATE ON public.llm_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.llm_settings (singleton) VALUES (true);