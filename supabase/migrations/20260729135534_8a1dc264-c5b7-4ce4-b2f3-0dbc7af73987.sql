ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS residence_country text;

-- 1) Ajuste do texto da 1ª pergunta (cidade -> país) nos 4 idiomas
UPDATE public.ai_agent_flow_steps s
SET messages = replace(replace(replace(replace(replace(
      s.messages::text,
      'onde você mora', 'em que país você mora'),
      'dónde vives', 'en qué país vives'),
      'donde vives', 'en qué país vives'),
      'where you live', 'which country you live in'),
      'où vous habitez', 'dans quel pays vous habitez')::jsonb
FROM public.ai_agent_flows f
WHERE f.id = s.flow_id
  AND f.name IN ('Conversa natural', 'Conversa natural Fred')
  AND s.step_code = 'dados_pessoais';

-- 2) city -> residence_country + perguntas próprias por campo obrigatório
UPDATE public.ai_agent_flow_steps s
SET validation = jsonb_set(
  s.validation,
  '{general_capture,fields}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN fld->>'source' = 'city' THEN jsonb_build_object(
          'source', 'residence_country',
          'target_field', 'contact.residence_country',
          'required', true,
          'prompts', jsonb_build_object(
            'pt-BR', 'Em que país você mora hoje?',
            'es', '¿En qué país vives actualmente?',
            'en', 'Which country do you live in right now?',
            'fr', 'Dans quel pays habitez-vous actuellement ?'
          )
        )
        WHEN fld->>'source' = 'full_name' THEN fld || jsonb_build_object(
          'prompts', jsonb_build_object(
            'pt-BR', 'Como você se chama?',
            'es', '¿Cómo te llamas?',
            'en', 'What is your name?',
            'fr', 'Comment vous appelez-vous ?'
          )
        )
        WHEN fld->>'source' = 'age' THEN fld || jsonb_build_object(
          'prompts', jsonb_build_object(
            'pt-BR', 'Qual é a sua idade?',
            'es', '¿Cuál es tu edad?',
            'en', 'How old are you?',
            'fr', 'Quel âge avez-vous ?'
          )
        )
        WHEN fld->>'source' = 'education_superior' THEN fld || jsonb_build_object(
          'prompts', jsonb_build_object(
            'pt-BR', 'Você possui formação superior?',
            'es', '¿Tienes formación superior (universitaria)?',
            'en', 'Do you have a university degree?',
            'fr', 'Avez-vous une formation universitaire ?'
          )
        )
        WHEN fld->>'source' = 'eu_family' THEN fld || jsonb_build_object(
          'prompts', jsonb_build_object(
            'pt-BR', 'Você possui algum familiar europeu?',
            'es', '¿Tienes algún familiar europeo?',
            'en', 'Do you have any European family member?',
            'fr', 'Avez-vous un membre de votre famille européen ?'
          )
        )
        WHEN fld->>'source' = 'europe_6m' THEN fld || jsonb_build_object(
          'prompts', jsonb_build_object(
            'pt-BR', 'Você esteve na Europa nos últimos 6 meses?',
            'es', '¿Has estado en Europa en los últimos 6 meses?',
            'en', 'Have you been in Europe in the last 6 months?',
            'fr', 'Avez-vous été en Europe au cours des 6 derniers mois ?'
          )
        )
        ELSE fld
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(s.validation->'general_capture'->'fields') WITH ORDINALITY AS t(fld, ord)
  )
)
FROM public.ai_agent_flows f
WHERE f.id = s.flow_id
  AND f.name IN ('Conversa natural', 'Conversa natural Fred')
  AND s.step_code = 'dados_pessoais'
  AND s.validation->'general_capture'->'fields' IS NOT NULL;

-- 3) Pergunta própria do objetivo (etapa 2)
UPDATE public.ai_agent_flow_steps s
SET validation = jsonb_set(
  s.validation,
  '{general_capture,fields}',
  (
    SELECT jsonb_agg(
      CASE WHEN fld->>'source' = 'intent' THEN fld || jsonb_build_object(
        'prompts', jsonb_build_object(
          'pt-BR', 'E qual é o seu objetivo aqui na Espanha?',
          'es', 'Y ¿cuál es tu objetivo aquí en España?',
          'en', 'And what is your goal here in Spain?',
          'fr', 'Et quel est votre objectif ici en Espagne ?'
        )
      ) ELSE fld END
      ORDER BY ord
    )
    FROM jsonb_array_elements(s.validation->'general_capture'->'fields') WITH ORDINALITY AS t(fld, ord)
  )
)
FROM public.ai_agent_flows f
WHERE f.id = s.flow_id
  AND f.name IN ('Conversa natural', 'Conversa natural Fred')
  AND s.step_code = 'objetivo'
  AND s.validation->'general_capture'->'fields' IS NOT NULL;