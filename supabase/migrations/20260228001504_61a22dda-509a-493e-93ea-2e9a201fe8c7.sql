-- Add ATENDENTE_WHATSAPP to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ATENDENTE_WHATSAPP';

-- Add a profile definition for the new role
INSERT INTO public.user_profile_definitions (role_code, display_name, detailed_description, is_active, display_order)
VALUES ('ATENDENTE_WHATSAPP', 'Atendente WhatsApp', 'Responsável pelo atendimento inicial de clientes via WhatsApp. Recebe leads automaticamente por round-robin.', true, 15)
ON CONFLICT DO NOTHING;
