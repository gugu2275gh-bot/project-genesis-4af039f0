-- =====================================================
-- MIGRAÇÃO: Limpeza COMPLETA - Fase Final
-- =====================================================

-- 1. Deletar todas as Tasks que referenciam o lead
DELETE FROM tasks 
WHERE related_lead_id = '52e69bab-3182-4385-9c27-055a7eb4927c';

-- 2. Deletar o Lead
DELETE FROM leads 
WHERE id = '52e69bab-3182-4385-9c27-055a7eb4927c';

-- 3. Deletar Interações que referenciam o contato
DELETE FROM interactions 
WHERE contact_id = 'e9a800c4-9401-4e49-9f3a-018013c68e09';

-- 4. Deletar o Contato
DELETE FROM contacts 
WHERE id = 'e9a800c4-9401-4e49-9f3a-018013c68e09';

-- 5. Limpar notificações do usuário
DELETE FROM notifications 
WHERE user_id = '427e54e9-f759-4b07-8a55-467ef470cc31';