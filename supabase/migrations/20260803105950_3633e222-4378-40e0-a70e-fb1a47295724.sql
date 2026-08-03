UPDATE public.ai_agent_flows
SET intake_config = intake_config || jsonb_build_object('strict_name', true),
    updated_at = now()
WHERE name = 'Pre-hands-off-g-v2';