-- Add new fields for TIE pickup appointment workflow
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS tie_pickup_requires_appointment boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tie_pickup_appointment_date date,
ADD COLUMN IF NOT EXISTS tie_pickup_appointment_time time,
ADD COLUMN IF NOT EXISTS tie_pickup_location text,
ADD COLUMN IF NOT EXISTS tie_ready_notification_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tie_estimated_ready_date date;

-- Add comment for documentation
COMMENT ON COLUMN service_cases.tie_pickup_requires_appointment IS 'Whether TIE pickup requires a prior appointment';
COMMENT ON COLUMN service_cases.tie_pickup_appointment_date IS 'Scheduled date for TIE pickup appointment';
COMMENT ON COLUMN service_cases.tie_pickup_appointment_time IS 'Scheduled time for TIE pickup appointment';
COMMENT ON COLUMN service_cases.tie_pickup_location IS 'Location for TIE pickup';
COMMENT ON COLUMN service_cases.tie_ready_notification_sent IS 'Whether client was notified that TIE is ready';
COMMENT ON COLUMN service_cases.tie_estimated_ready_date IS 'Estimated date when TIE will be ready for pickup';