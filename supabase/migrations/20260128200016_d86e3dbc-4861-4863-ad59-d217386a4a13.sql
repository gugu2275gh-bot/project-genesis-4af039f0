-- Create initial_contact_reminders table to track SLA reminders
CREATE TABLE public.initial_contact_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_case_id UUID NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL, -- D1, D2, D3, COORD_72H, ADM_5D
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(service_case_id, reminder_type)
);

-- Add first_contact_at to service_cases
ALTER TABLE public.service_cases 
ADD COLUMN first_contact_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS
ALTER TABLE public.initial_contact_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for initial_contact_reminders
CREATE POLICY "Service role can insert reminders"
ON public.initial_contact_reminders
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Staff can view reminders"
ON public.initial_contact_reminders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('ADMIN', 'MANAGER', 'TECNICO', 'ATENCAO_CLIENTE')
  )
);

-- Add comment for documentation
COMMENT ON TABLE public.initial_contact_reminders IS 'Tracks SLA reminders for initial contact to avoid duplicate notifications';
COMMENT ON COLUMN public.initial_contact_reminders.reminder_type IS 'D1=24h, D2=48h, D3=72h, COORD_72H=Manager escalation, ADM_5D=Admin escalation';
COMMENT ON COLUMN public.service_cases.first_contact_at IS 'Timestamp when technician made first contact with client';