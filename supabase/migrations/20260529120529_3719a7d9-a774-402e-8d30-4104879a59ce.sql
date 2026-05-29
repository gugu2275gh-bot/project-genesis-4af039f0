
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if it exists (idempotent)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'whatsapp-stall-watchdog-1m';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'whatsapp-stall-watchdog-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xdnliyuogkoxckbesktx.supabase.co/functions/v1/whatsapp-stall-watchdog',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkbmxpeXVvZ2tveGNrYmVza3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MDE1NDMsImV4cCI6MjA4MTM3NzU0M30.qYYrZd1l-IkBjPUZ0w9jTqM-ChaghpAZrTqlri3hnbw"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
