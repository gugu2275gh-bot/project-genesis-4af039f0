-- Inserir subcategorias faltantes
INSERT INTO expense_categories (name, type, description, is_active) VALUES
  -- Despesas Fixas faltantes
  ('Água', 'FIXA', 'Conta de água', true),
  ('Luz', 'FIXA', 'Conta de eletricidade', true),
  ('Salários', 'FIXA', 'Salários de funcionários', true),
  ('Seguridade Social', 'FIXA', 'Encargos sociais', true),
  ('Gestoria', 'FIXA', 'Contabilidade terceirizada', true),
  ('Domínio/Google', 'FIXA', 'Serviços de email e cloud', true),
  
  -- Despesas Variáveis faltantes
  ('Acqua Service', 'VARIAVEL', 'Água e café para escritório', true),
  ('Notaría', 'VARIAVEL', 'Custos com cartório', true),
  ('Taxas Bancárias', 'VARIAVEL', 'Taxas de manutenção e transferências', true),
  ('Mercadona', 'VARIAVEL', 'Suprimentos e alimentação', true),
  ('Comissões Pagas', 'VARIAVEL', 'Comissões a colaboradores', true)
ON CONFLICT DO NOTHING;

-- Renomear "Contabilidade" para "Contabilidade Interna" para diferenciar de Gestoria
UPDATE expense_categories 
SET name = 'Contabilidade Interna', description = 'Custos contábeis internos'
WHERE name = 'Contabilidade';