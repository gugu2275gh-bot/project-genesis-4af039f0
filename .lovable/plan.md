# Diagnóstico do valor incorreto no serviço

## Onde está acontecendo

Na tela do contrato, o valor exibido vem dos registros da tabela `payments`, não do cadastro do tipo de serviço.

O ponto da tela que monta esse bloco é o detalhe do contrato, no trecho que gera as informações de pagamento. Ele usa:

- `gross_amount` para mostrar **Valor do Serviço**;
- `vat_amount` para mostrar o IVA;
- `amount` para mostrar **Total Final**.

## O que encontrei no banco

Para o contrato da cliente **MARINA AGOSTO** / contrato nº **87**, serviço **Certificado de antecedentes penales (en Brasil)**, existem dois pagamentos confirmados vinculados ao mesmo contrato:

1. Pagamento correto:
   - valor base: **€ 100,00**
   - IVA: **€ 21,00**
   - total: **€ 121,00**

2. Pagamento incorreto/extra:
   - valor base: **€ 73,26**
   - IVA: **€ 0,00**
   - total: **€ 73,26**

Também existem duas faturas emitidas para o mesmo contrato:

1. Uma fatura com base **€ 60,55** e total **€ 73,26**.
2. Uma fatura com base **€ 100,00** e total **€ 121,00**.

## Motivo da diferença

O problema não está no cadastro do serviço. O cadastro do tipo de serviço só tem nome/código e não guarda preço.

A diferença acontece porque há um pagamento antigo/extra de **€ 73,26** ainda vinculado ao contrato. A tela lê os pagamentos do contrato e, por isso, ainda consegue exibir esse valor mesmo depois do pagamento correto de **€ 100,00 + IVA** ter sido criado.

Pelo histórico, o pagamento de **€ 73,26** foi criado depois do pagamento correto e depois também foi confirmado. Isso deixou dois pagamentos confirmados para o mesmo serviço/contrato.

## Próxima correção sugerida

Se quiser que eu corrija, o ajuste deve ser:

1. Remover ou cancelar o pagamento/fatura incorretos de **€ 73,26** desse contrato.
2. Manter apenas o pagamento correto de **€ 100,00 + IVA = € 121,00**.
3. Adicionar uma proteção para evitar dois pagamentos únicos confirmados para o mesmo serviço no mesmo contrato, quando não forem parcelas.
