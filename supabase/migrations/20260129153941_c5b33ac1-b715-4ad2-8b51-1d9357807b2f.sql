-- Step 10: Huellas Scheduling - Add tracking columns and reminders table

-- Add new columns to service_cases for huellas workflow
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS empadronamiento_valid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS empadronamiento_expected_date DATE,
ADD COLUMN IF NOT EXISTS empadronamiento_notes TEXT,
ADD COLUMN IF NOT EXISTS huellas_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS huellas_scheduler_notified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS huellas_appointment_confirmation_url TEXT,
ADD COLUMN IF NOT EXISTS huellas_client_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS huellas_instructions_sent BOOLEAN DEFAULT false;

-- Create huellas_reminders table for tracking automated notifications
CREATE TABLE IF NOT EXISTS huellas_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'SCHEDULE_48H', 'D7_PREP', 'D3_PREP', 'D1_PREP', 'EMPAD_WAITING'
  recipient_type TEXT NOT NULL, -- 'TECH', 'SCHEDULER', 'CLIENT', 'COORD'
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_huellas_reminders_case ON huellas_reminders(service_case_id, reminder_type);

-- Enable RLS on huellas_reminders
ALTER TABLE huellas_reminders ENABLE ROW LEVEL SECURITY;

-- Create policies for huellas_reminders
CREATE POLICY "Users can view huellas reminders" 
ON huellas_reminders 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert huellas reminders" 
ON huellas_reminders 
FOR INSERT 
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE huellas_reminders IS 'Tracks automated reminders sent for huellas scheduling workflow';