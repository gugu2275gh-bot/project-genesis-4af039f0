ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check 
CHECK (action = ANY (ARRAY['INSERT','UPDATE','DELETE','MERGE','CREATE','STATUS_CHANGE']));