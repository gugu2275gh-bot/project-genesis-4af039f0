# Numeração sequencial e idioma único nos contratos

## Objetivo
Aplicar como regra que cada parágrafo de uma lista numerada receba seu próprio número sequencial, sem deixar itens seguintes como parágrafos soltos. Garantir também que o contrato inteiro seja emitido em espanhol, inclusive os dados transportados do sistema.

## Alterações
- Corrigir o bloco **“2.1. Los honorarios no incluyen”** para exibir `1.`, `2.`, `3.` e, quando houver um quarto item no modelo de nacionalidade, `4.`.
- Centralizar essa lista em uma estrutura compartilhada para evitar diferenças entre os modelos **Documentos**, **Nacionalidade** e **Regularização Extraordinária**.
- Aplicar a mesma sequência na pré-visualização, no PDF e no Word.
- Manter os textos específicos já existentes em cada modelo, alterando apenas a regra de numeração e apresentação.
- Criar uma camada única de idioma para o contrato, usando espanhol como idioma vigente e impedindo a mistura com textos em português.
- Traduzir para espanhol os conteúdos livres transportados do sistema, como descrição do serviço e condições de pagamento, sem alterar o valor original salvo no cadastro.
- Converter rótulos e valores controlados do sistema — tipos de documento, formas de pagamento, estados e outros campos exibidos — para suas versões em espanhol.
- Aplicar a regra de idioma único igualmente na pré-visualização, no PDF e no Word.

## Validação
- Conferir os três modelos na pré-visualização.
- Gerar PDF e Word para confirmar que todos os itens aparecem em ordem, sem marcadores ou parágrafos sem número.
- Verificar que linhas longas continuam alinhadas corretamente abaixo do texto do item.
- Gerar contratos com dados cadastrados em português e confirmar que nenhuma frase ou rótulo em português aparece na saída em espanhol.
- Confirmar que nomes próprios, números de documentos, nomes de bancos, IBANs, valores e demais dados que não devem ser traduzidos permanecem intactos.

## Detalhe técnico
Hoje esse bloco está inconsistente: dois modelos usam marcadores, enquanto o modelo **Documentos** numera somente o primeiro item e deixa os dois seguintes como parágrafos comuns. A correção usará o tipo numerado para cada entrada da lista em todas as saídas do contrato.

Os dados dinâmicos entram hoje diretamente no documento, incluindo a descrição do serviço e as condições de pagamento. A geração passará a normalizar esses dados para o espanhol antes de montar as três saídas, preservando identificadores e dados pessoais que não devem ser traduzidos.
