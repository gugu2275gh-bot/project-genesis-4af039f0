# Numeração sequencial nos itens do contrato

## Objetivo
Aplicar como regra que cada parágrafo de uma lista numerada receba seu próprio número sequencial, sem deixar itens seguintes como parágrafos soltos.

## Alterações
- Corrigir o bloco **“2.1. Los honorarios no incluyen”** para exibir `1.`, `2.`, `3.` e, quando houver um quarto item no modelo de nacionalidade, `4.`.
- Centralizar essa lista em uma estrutura compartilhada para evitar diferenças entre os modelos **Documentos**, **Nacionalidade** e **Regularização Extraordinária**.
- Aplicar a mesma sequência na pré-visualização, no PDF e no Word.
- Manter os textos específicos já existentes em cada modelo, alterando apenas a regra de numeração e apresentação.

## Validação
- Conferir os três modelos na pré-visualização.
- Gerar PDF e Word para confirmar que todos os itens aparecem em ordem, sem marcadores ou parágrafos sem número.
- Verificar que linhas longas continuam alinhadas corretamente abaixo do texto do item.

## Detalhe técnico
Hoje esse bloco está inconsistente: dois modelos usam marcadores, enquanto o modelo **Documentos** numera somente o primeiro item e deixa os dois seguintes como parágrafos comuns. A correção usará o tipo numerado para cada entrada da lista em todas as saídas do contrato.
