DROP TRIGGER IF EXISTS notifica_resposta_whatsapp ON public.mensagens_cliente;
DROP FUNCTION IF EXISTS public.dispara_webhook_resposta() CASCADE;