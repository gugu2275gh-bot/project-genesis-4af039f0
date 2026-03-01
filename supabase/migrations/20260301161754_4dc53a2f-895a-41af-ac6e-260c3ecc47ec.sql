
-- Add new lead statuses
ALTER TYPE public.lead_status ADD VALUE 'STANDBY';
ALTER TYPE public.lead_status ADD VALUE 'FOLLOW_UP';

-- Add follow_up_date column to leads
ALTER TABLE public.leads ADD COLUMN follow_up_date date NULL;
