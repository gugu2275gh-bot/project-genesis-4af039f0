UPDATE public.ai_agent_flow_steps
SET validation = jsonb_set(COALESCE(validation, '{}'::jsonb), '{ack_enabled}', 'false'::jsonb, true)
WHERE COALESCE(validation->>'ack_enabled', '') = 'true';