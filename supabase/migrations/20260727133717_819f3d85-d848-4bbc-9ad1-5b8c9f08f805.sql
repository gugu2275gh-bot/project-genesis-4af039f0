UPDATE public.ai_agent_flow_steps
SET messages = jsonb_build_object(
  'pt-BR', to_jsonb(ARRAY['Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário.']),
  'es', to_jsonb(ARRAY['Perfecto. Te haré unas preguntas rápidas solo para entender mejor tu situación.']),
  'en', to_jsonb(ARRAY['Perfect. I will ask you a few quick questions just to better understand your situation.']),
  'fr', to_jsonb(ARRAY['Parfait. Je vais vous poser quelques questions rapides simplement pour mieux comprendre votre situation.'])
)
WHERE id = '72409112-fc32-4c77-b97c-57d9fe5bf7b7';