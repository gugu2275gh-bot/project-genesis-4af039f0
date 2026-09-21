# Scroll lateral visível na tela de Faturas

## Contexto
Na tela Financeiro → Faturas (`/finance/invoices`), a tabela tem mais colunas do que cabem na tela e a barra de rolagem horizontal (lateral) quase não aparece — é fina (8px) e só fica evidente ao interagir, então o usuário não percebe que pode rolar para chegar aos botões de ação (⬇ Download, etc.).

## O que será feito
1. **Barra de rolagem lateral sempre visível na tabela de faturas** — na área da tabela de faturas, a barra horizontal ficará permanentemente visível (sem precisar passar o mouse ou tentar rolar "no escuro") e um pouco mais grossa, para ser fácil de agarrar e arrastar.
2. **Aplicado apenas à tela de Faturas** (via classe CSS específica no container da tabela), sem alterar as demais telas do sistema.

## Detalhes técnicos
- `src/pages/finance/Invoices.tsx`: envolver o `<DataTable>` com um container que receba uma classe própria (ex.: `invoices-table-scroll`).
- `src/index.css`: nova regra para essa classe — `overflow-x: scroll` (força a barra sempre visível) e `::-webkit-scrollbar` com altura maior (ex.: 12px) e polegar mais contrastante.
- Nenhuma mudança de dados ou regras de negócio.

## Verificação
- Abrir `/finance/invoices` no preview e confirmar que a barra de rolagem horizontal aparece sempre, na parte de baixo da tabela, e que rolando até o fim aparecem os ícones de ação da linha.
