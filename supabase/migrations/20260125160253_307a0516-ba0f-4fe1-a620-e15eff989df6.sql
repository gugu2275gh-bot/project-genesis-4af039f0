-- Remover constraint existente
ALTER TABLE public.payment_reminders 
DROP CONSTRAINT IF EXISTS payment_reminders_reminder_type_check;

-- Adicionar nova constraint com todos os tipos necessários
ALTER TABLE public.payment_reminders 
ADD CONSTRAINT payment_reminders_reminder_type_check 
CHECK (reminder_type IN (
  'D1', 'D3', 'D7', 'CANCELLED',
  'PRE_7D', 'PRE_48H', 'DUE_TODAY',
  'POST_D1', 'POST_D3', 'POST_D7'
));