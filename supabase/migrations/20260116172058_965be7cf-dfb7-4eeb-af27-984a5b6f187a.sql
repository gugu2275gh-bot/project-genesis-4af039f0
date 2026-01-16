-- Create user rvbarros@gmail.com directly
-- First, insert into profiles (the trigger on auth.users will handle this, but we prepare the role)
-- We'll need to create via Supabase Auth Admin API

-- For now, let's check if we can insert a pending user entry
-- The actual user creation must happen via Supabase Dashboard or Auth Admin API

-- This migration just prepares the role assignment
-- After you create the user in Supabase Dashboard, run:
-- INSERT INTO user_roles (user_id, role) VALUES ('<USER_ID>', 'ADMIN');

SELECT 1; -- Placeholder