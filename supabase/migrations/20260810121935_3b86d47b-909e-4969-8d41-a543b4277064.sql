UPDATE public.ai_agent_flow_steps s
SET validation = COALESCE(s.validation, '{}'::jsonb) || jsonb_build_object(
  'aside_answer', jsonb_build_object(
    'mode', 'SO_RETOMAR',
    'min_chars', 12,
    'attempts', 1,
    'messages', '{}'::jsonb
  )
)
FROM public.ai_agent_flows f
WHERE s.flow_id = f.id
  AND f.name = 'Pre-hands-off-g-v3'
  AND COALESCE(s.validation->>'step_kind', 'PERGUNTA') IN ('PERGUNTA', 'PERGUNTA_GERAL')
  AND s.validation->'aside_answer' IS NULL;