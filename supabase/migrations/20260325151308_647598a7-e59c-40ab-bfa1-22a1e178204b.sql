
CREATE TABLE public.message_dedup (
  message_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cleanup: remove entries older than 24h to keep table small
CREATE OR REPLACE FUNCTION public.cleanup_old_dedup_entries()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.message_dedup WHERE created_at < now() - interval '24 hours';
$$;

-- Disable RLS (internal system table, only accessed by service role)
ALTER TABLE public.message_dedup ENABLE ROW LEVEL SECURITY;
