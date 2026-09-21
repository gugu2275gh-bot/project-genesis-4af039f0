# Correção do texto de pagamentos únicos no contrato

## Objetivo
Corrigir o resumo financeiro do contrato para não chamar pagamentos únicos de “parcelas”. Quando houver mais de um pagamento único na mesma data, o texto deve dizer “pagamentos”, evitando interpretação errada pelo operador.

## O que será alterado
- Ajustar o resumo de vencimentos para usar:
  - `1 pagamento` quando houver um pagamento único.
  - `2 pagamentos`, `3 pagamentos`, etc. quando houver vários pagamentos únicos na mesma data.
  - `1 parcela`, `2 parcelas`, etc. somente quando o pagamento fizer parte de um plano parcelado.
- Corrigir a linha de total para deixar claro o valor total a pagar na data, sem sugerir parcelamento quando os itens são pagamentos únicos.
- Manter os detalhes por serviço exibindo `Forma: Pago Único` quando o pagamento for único.
- Aplicar a regra na pré-visualização e nos arquivos gerados do contrato, porque PDF e Word usam o mesmo texto do resumo.

## Regra de negócio
Pagamentos únicos não são parcelas, mesmo quando existem dois ou mais pagamentos no mesmo contrato ou vencem no mesmo dia. A palavra “parcela” só deve aparecer quando a forma de pagamento for parcelada.

## Validação
- Abrir o contrato mostrado na imagem e confirmar que a linha passa de `(2 cuotas/parcelas)` para `(2 pagos/pagamentos)` conforme o idioma do contrato.
- Conferir um contrato realmente parcelado para garantir que ele continua usando “parcela/cuota”.
- Gerar PDF e Word para confirmar que o mesmo texto correto aparece nos documentos.

## Detalhe técnico
O resumo atual consolida os pagamentos por data de vencimento e escolhe o rótulo pelo número de itens encontrados. A correção vai considerar também a forma de pagamento de cada item antes de escolher entre “pagamento” e “parcela”.
