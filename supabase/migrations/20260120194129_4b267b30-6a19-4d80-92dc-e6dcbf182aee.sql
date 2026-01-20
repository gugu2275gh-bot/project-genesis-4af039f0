-- Adicionar COLABORADOR ao enum origin_channel
ALTER TYPE origin_channel ADD VALUE 'COLABORADOR';

-- Adicionar campo para nome do colaborador/referência
ALTER TABLE contacts ADD COLUMN referral_name text;