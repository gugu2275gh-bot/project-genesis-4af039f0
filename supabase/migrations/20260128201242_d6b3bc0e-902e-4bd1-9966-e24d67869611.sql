-- Inserir documentos para EX19 (Residência por Parente de Comunitário)
INSERT INTO service_document_types 
  (service_type, name, description, is_required, needs_apostille, needs_translation, validity_days)
VALUES
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Autorização para Tramitar', 
   'Documento gerado pelo técnico, deve ser assinado pelo interessado', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Formulário EX19', 
   'Preenchido e gerado pelo técnico, assinado por ambos os interessados', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Passaporte Completo do Interessado', 
   'Cópia digital (scanner) de todas as páginas do passaporte válido', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Documento de Identidade/NIE do Parceiro', 
   'Cópia (frente e verso) do NIE, DNI ou passaporte do cônjuge/parceiro comunitário', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Passaporte ou ID do Parceiro', 
   'Cópia completa de todas as páginas do passaporte ou documento de identidade do parceiro', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado de Empadronamento de Ambos', 
   'Documento de registro na prefeitura comprovando residência de ambos no mesmo endereço', 
   true, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado de Convivência', 
   'Comprovante oficial de convivência comum, se aplicável', 
   false, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Registro de União Estável', 
   'Registro de pareja de hecho atualizado (para parceiros não casados oficialmente)', 
   false, true, true, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Casamento', 
   'Devidamente apostilada/legalizada e traduzida por tradutor juramentado (se casamento fora da Espanha)', 
   false, true, true, 180),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Contrato de Trabalho do Parceiro', 
   'Contrato de trabalho do parceiro comunitário, assinado por ambas as partes', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Holerites do Parceiro (3 meses)', 
   'Comprovantes de pagamento/salário do parceiro nos últimos 3 meses', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Informe de Vida Laboral do Parceiro', 
   'Documento oficial de histórico laboral na Espanha', 
   true, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado Bancário', 
   'Comprovante emitido pelo banco mostrando os recursos financeiros/disponibilidade', 
   true, false, false, 20),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Seguro de Saúde', 
   'Cópia da apólice completa de seguro de saúde válido (público ou privado)', 
   false, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Estado Civil do Interessado', 
   'Documento do país de origem comprovando estado civil, com apostila e tradução juramentada', 
   true, true, true, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Estado Civil do Parceiro', 
   'Documento equivalente para o parceiro comunitário, apostilado e traduzido', 
   true, true, true, 90);