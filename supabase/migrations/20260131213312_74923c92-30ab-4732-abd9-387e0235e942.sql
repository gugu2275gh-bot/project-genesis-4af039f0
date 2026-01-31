-- Add suspension fields to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS suspension_reason text;

-- Add suspension fields to service_cases table
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS suspension_reason text;