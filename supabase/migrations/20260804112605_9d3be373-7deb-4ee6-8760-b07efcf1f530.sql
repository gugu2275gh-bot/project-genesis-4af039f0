REVOKE ALL ON FUNCTION public.archive_whatsapp_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_conversation_log_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_conversation_log_session() TO authenticated, service_role;