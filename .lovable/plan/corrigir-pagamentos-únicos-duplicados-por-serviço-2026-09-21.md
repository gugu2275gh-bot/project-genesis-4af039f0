# Corrigir pagamentos únicos duplicados por serviço

## Diagnóstico confirmado

A tela do contrato mostra o valor a partir dos pagamentos vinculados ao contrato (`gross_amount`, `vat_amount`, `amount`), não do cadastro do tipo de serviço (que não guarda preço).

No contrato nº 87 (MARINA AGOSTO, serviço "Certificado de antecedentes penales (en Brasil)") existem dois pagamentos confirmados para o mesmo serviço:

- correto: base € 100,00 + IVA € 21,00 = € 121,00
- incorreto: € 73,26 sem IVA (criado depois, também confirmado)

Existem duas faturas emitidas nesse contrato: uma de € 121,00 (correta) e uma de € 73,26 (do pagamento incorreto).

## O que será feito

1. Cancelar a fatura de € 73,26 desse contrato e remover o pagamento incorreto de € 73,26, mantendo somente o pagamento de € 121,00.
2. Levantar todos os contratos com mais de um pagamento único confirmado para o mesmo serviço/beneficiário e corrigir do mesmo jeito: manter o pagamento correto e cancelar fatura + remover o pagamento duplicado.
3. Criar uma proteção no banco que impeça dois pagamentos únicos ativos para o mesmo contrato, serviço e beneficiário, permitindo normalmente várias parcelas de um plano parcelado.

## Detalhes técnicos

- Limpeza de dados via comandos de atualização/remoção nas tabelas `invoices` e `payments`, respeitando os registros ligados (fatura antes do pagamento).
- Proteção por gatilho de validação em `payments` (não por CHECK), verificando duplicidade de pagamento com `payment_form = 'UNICO'` no mesmo `contract_id` + `opportunity_id` + `beneficiary_contact_id` quando o status não for estornado/cancelado.
- Antes da proteção entrar em vigor, todos os casos existentes precisam estar corrigidos, senão futuras edições desses pagamentos passariam a falhar.

## Validação

- Reabrir o contrato nº 87 e confirmar que aparece somente € 100,00 + IVA = € 121,00.
- Conferir em Faturas que a fatura de € 73,26 está cancelada e a de € 121,00 permanece.
- Conferir um contrato parcelado para garantir que as parcelas continuam funcionando.
