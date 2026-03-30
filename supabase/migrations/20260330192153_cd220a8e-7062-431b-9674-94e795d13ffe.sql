
-- Drop the unique constraint on automation_type to allow multiple languages per type
ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_automation_type_key;

-- Insert Spanish translations
INSERT INTO public.whatsapp_templates (automation_type, template_name, body_text, variables, status, is_active) VALUES
('welcome', 'cb_welcome_es', 'Hola {{1}}! Gracias por contactar con CB Asesoría. En breve uno de nuestros especialistas le atenderá.', '["nombre"]'::jsonb, 'draft', false),
('reengagement', 'cb_reengagement_es', 'Hola {{1}}! Hemos notado que su registro está incompleto. ¿Podemos ayudarle a completar su información?', '["nombre"]'::jsonb, 'draft', false),
('contract_reminder', 'cb_contract_reminder_es', 'Hola {{1}}! Su contrato está pendiente de firma. Acceda al portal para finalizarlo.', '["nombre"]'::jsonb, 'draft', false),
('payment_pre_7d', 'cb_payment_pre_7d_es', 'Hola {{1}}! 📅 Su cuota de €{{2}} vence en 7 días ({{3}}). Recuerde realizar el pago.', '["nombre","valor","fecha"]'::jsonb, 'draft', false),
('payment_pre_48h', 'cb_payment_pre_48h_es', 'Hola {{1}}! ⏰ Su cuota de €{{2}} vence en 2 días ({{3}}). Por favor, realice el pago.', '["nombre","valor","fecha"]'::jsonb, 'draft', false),
('payment_due_today', 'cb_payment_due_today_es', 'Hola {{1}}! 🔔 Hoy vence su cuota de €{{2}}. Realice el pago antes del final del día.', '["nombre","valor"]'::jsonb, 'draft', false),
('payment_post_d1', 'cb_payment_post_d1_es', 'Hola {{1}}! Tiene un pago de €{{2}} pendiente. Regularice su situación para evitar la cancelación.', '["nombre","valor"]'::jsonb, 'draft', false),
('payment_post_d3', 'cb_payment_post_d3_es', 'Hola {{1}}! ⚠️ Su pago de €{{2}} lleva 3 días de retraso. Regularice urgentemente.', '["nombre","valor"]'::jsonb, 'draft', false),
('document_reminder', 'cb_document_reminder_es', 'Hola {{1}}! 📄 Estamos esperando el documento: {{2}}. Por favor, envíelo a través del portal.', '["nombre","documento"]'::jsonb, 'draft', false),
('onboarding_reminder', 'cb_onboarding_reminder_es', 'Hola {{1}}! 📝 Complete su registro en el portal para iniciar su trámite.', '["nombre"]'::jsonb, 'draft', false),
('tie_pickup', 'cb_tie_pickup_es', 'Hola {{1}}! 🎊 Su TIE está disponible para recoger. Plazo: {{2}}.', '["nombre","fecha"]'::jsonb, 'draft', false),
('huellas_reminder', 'cb_huellas_reminder_es', 'Hola {{1}}! 🔔 Recordatorio sobre su cita de huellas: {{2}}.', '["nombre","fecha"]'::jsonb, 'draft', false);
