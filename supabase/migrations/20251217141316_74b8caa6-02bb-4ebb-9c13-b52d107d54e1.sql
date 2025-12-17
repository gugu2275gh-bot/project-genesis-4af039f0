-- Enable RLS on leads table (policies already exist, just need to enable RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;