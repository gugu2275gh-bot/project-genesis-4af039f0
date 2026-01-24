-- Adicionar coluna para tipo de template de contrato
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_template text DEFAULT 'GENERICO';

-- Comentário descritivo
COMMENT ON COLUMN contracts.contract_template IS 'Modelo de contrato: NACIONALIDADE ou GENERICO';