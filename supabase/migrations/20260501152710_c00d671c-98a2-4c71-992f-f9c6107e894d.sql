UPDATE public.contacts
SET referral_name = 'Instagram'
WHERE id = '9e09ce83-c986-45ba-8157-6af413f13cb4'
  AND (referral_name IS NULL OR btrim(referral_name) = '');