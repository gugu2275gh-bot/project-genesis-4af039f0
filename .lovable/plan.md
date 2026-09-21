# Plano: gerar fatura pendente na aprovação do contrato

## Objetivo
Quando um contrato for aprovado, o sistema deve criar automaticamente uma fatura no módulo de Faturas com status **Pendente**.

## O que será alterado
- Ajustar a aprovação do contrato para, depois de gerar/vincular os pagamentos do contrato, criar a fatura automaticamente.
- A fatura criada na aprovação ficará com status **PENDENTE** e aparecerá no módulo de Faturas.
- Evitar fatura duplicada para o mesmo contrato se o contrato for aprovado mais de uma vez ou se já existir fatura vinculada.
- Atualizar o módulo de Faturas para exibir o novo status **Pendente** com ações adequadas.
- Manter o fluxo atual de fatura por pagamento confirmado sem quebrar os registros existentes.

## Regras de negócio
- A fatura nasce na aprovação do contrato, antes da assinatura.
- A fatura deve usar os dados do cliente, serviço e valores já vinculados ao contrato/pagamentos.
- Se houver mais de um pagamento no contrato, a fatura deve representar o total do contrato, não uma fatura por parcela/pagamento nesse momento.
- A fatura automática deve respeitar a regra de conta bancária/“Emitir fatura” quando essa informação estiver disponível nos pagamentos.
- Se não houver uma conta bancária marcada para emitir fatura, o sistema não deve criar uma fatura automática indevida.

## Ajustes técnicos
- Criar uma migração para permitir o status `PENDENTE` na tabela `invoices`.
- Criar uma função segura no banco para gerar a fatura pendente a partir do contrato aprovado, com trava de numeração para evitar números duplicados.
- Chamar essa função no fluxo `approveContract` em `useContracts`, depois de `ensureContractPayments(contract)`.
- Invalidar também o cache de `invoices` ao aprovar contrato.
- Atualizar tipos/labels locais de faturas para reconhecer `PENDENTE`.
- Revisar a regra atual `auto_create_invoice_on_payment_confirmed` para não duplicar uma fatura quando já existir fatura do contrato.

## Validação
- Aprovar um contrato em elaboração e confirmar que a fatura aparece no módulo de Faturas como **Pendente**.
- Repetir a ação ou atualizar o contrato sem criar duplicidade.
- Confirmar que faturas existentes continuam aparecendo corretamente.
- Confirmar que a geração por pagamento confirmado não cria segunda fatura para o mesmo contrato.
