-- Add new fields to requirements_from_authority for tracking responses and extensions
ALTER TABLE requirements_from_authority 
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS response_sent_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_deadline_date DATE,
ADD COLUMN IF NOT EXISTS extension_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extension_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS coordinator_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS response_file_url TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add new enum values for requirement status
ALTER TYPE requirement_status ADD VALUE IF NOT EXISTS 'EM_PRORROGACAO';
ALTER TYPE requirement_status ADD VALUE IF NOT EXISTS 'PRORROGADA';

-- Create requirement_reminders table for tracking sent alerts
CREATE TABLE IF NOT EXISTS requirement_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements_from_authority(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'IMMEDIATE', 'D3', 'D2_ADM', 'RESPONSE_CONFIRMED', 'EXTENSION_REQUESTED'
  recipient_type TEXT NOT NULL, -- 'TECH', 'COORD', 'ADM', 'JURIDICO'
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_requirement_reminders_lookup 
ON requirement_reminders(requirement_id, reminder_type);

-- Add previous_case_id for process history linking
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS previous_case_id UUID REFERENCES service_cases(id),
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closure_reason TEXT;

-- Enable RLS on requirement_reminders
ALTER TABLE requirement_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for requirement_reminders (staff can view/insert)
CREATE POLICY "Staff can view requirement reminders" 
ON requirement_reminders 
FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'JURIDICO', 'TECNICO', 'ATENCAO_CLIENTE']::app_role[])
);

CREATE POLICY "Staff can insert requirement reminders" 
ON requirement_reminders 
FOR INSERT 
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'JURIDICO', 'TECNICO', 'ATENCAO_CLIENTE']::app_role[])
);

-- Add SLA configuration entries for requirement alerts
INSERT INTO system_config (key, value, description) VALUES
  ('sla_requirement_immediate_alert', 'true', 'Send immediate alert when requirement is created'),
  ('sla_requirement_d3_alert_days', '3', 'Days before deadline to send D-3 alert'),
  ('sla_requirement_d2_alert_days', '2', 'Days before deadline to send D-2 ADM alert'),
  ('sla_requirement_extension_days', '5', 'Default extension period in days'),
  ('sla_requirement_max_extensions', '3', 'Maximum number of extensions allowed'),
  ('sla_resource_d7_alert_days', '7', 'Days before resource deadline to send first alert'),
  ('sla_resource_d5_alert_days', '5', 'Days before resource deadline to send coordinator alert'),
  ('sla_resource_d3_alert_days', '3', 'Days before resource deadline to send ADM alert')
ON CONFLICT (key) DO NOTHING;