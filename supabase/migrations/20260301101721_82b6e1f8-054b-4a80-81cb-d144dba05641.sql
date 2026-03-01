
-- Step 1: Add SUPERVISOR to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'SUPERVISOR';
