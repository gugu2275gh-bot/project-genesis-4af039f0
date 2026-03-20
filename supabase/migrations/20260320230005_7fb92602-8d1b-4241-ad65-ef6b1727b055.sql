INSERT INTO public.system_config (key, value, description) VALUES
  ('active_session_timeout_minutes', '120', 'Tempo em minutos para expiração da sessão ativa do cliente'),
  ('enable_smart_reactivation', 'true', 'Habilita o motor de reativação inteligente de sessões'),
  ('llm_confidence_threshold_direct_route', '0.90', 'Threshold mínimo de confiança para roteamento direto sem confirmação'),
  ('llm_confidence_threshold_confirmation', '0.70', 'Threshold mínimo de confiança para pedir confirmação ao cliente'),
  ('reactivation_context_message_limit', '5', 'Número máximo de mensagens de contexto por pendência para enviar à LLM')
ON CONFLICT (key) DO NOTHING;