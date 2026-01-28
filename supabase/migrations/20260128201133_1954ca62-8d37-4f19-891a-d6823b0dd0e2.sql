-- 1. Adicionar novo tipo de serviço ao enum
ALTER TYPE service_interest ADD VALUE 'RESIDENCIA_PARENTE_COMUNITARIO';

-- 2. Adicionar campo de validade aos tipos de documento
ALTER TABLE service_document_types 
ADD COLUMN IF NOT EXISTS validity_days INTEGER;