-- Hotfix: destravar conversa do Gustavo (lead 9b82823b...)
UPDATE public.contacts
SET full_name = 'Gustavo',
    email = COALESCE(email, 'gustavohbf16@gmail.com'),
    name_source = 'USER_CONFIRMED',
    updated_at = now()
WHERE id = '4c2ed246-212e-431b-8f38-622b59fe810c';

UPDATE public.leads
SET service_interest = 'VISTO_ESTUDANTE',
    interest_confirmed = true,
    updated_at = now()
WHERE id = '9b82823b-39b6-4937-b5a2-71364ca9ee4a';

UPDATE public.lead_funnel_state
SET name_confirmed = true,
    email_confirmed = true,
    interest_confirmed = 'VISTO_ESTUDANTE',
    step = 'localizacao',
    last_step_change = now(),
    updated_at = now()
WHERE lead_id = '9b82823b-39b6-4937-b5a2-71364ca9ee4a';