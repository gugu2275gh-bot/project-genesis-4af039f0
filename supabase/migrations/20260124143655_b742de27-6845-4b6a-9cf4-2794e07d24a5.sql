-- Renomear payment_status QUITADO para CONCLUIDO em contratos existentes
UPDATE contracts 
SET payment_status = 'CONCLUIDO' 
WHERE payment_status = 'QUITADO';

-- Adicionar comentário explicativo na coluna
COMMENT ON COLUMN contracts.payment_status IS 'Status de pagamento: NAO_INICIADO (nenhum pagamento), INICIADO (parcelas pendentes), CONCLUIDO (todas as parcelas pagas)';