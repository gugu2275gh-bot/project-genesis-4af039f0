INSERT INTO public.contact_data_suggestions (contact_id, field_name, suggested_value, current_value, source, status)
SELECT
  '9e09ce83-c986-45ba-8157-6af413f13cb4'::uuid,
  'referral_name',
  'Instagram',
  NULL,
  'whatsapp',
  'pending'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contact_data_suggestions
  WHERE contact_id = '9e09ce83-c986-45ba-8157-6af413f13cb4'::uuid
    AND field_name = 'referral_name'
    AND suggested_value = 'Instagram'
    AND status = 'pending'
);