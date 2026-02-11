
# Pre-visualizacao e Edicao do Contrato na Pagina de Detalhes

## Resumo

Adicionar uma nova aba "Pre-visualizacao" na area destacada (ao lado de "Detalhes" e "Beneficiarios") que mostra o texto completo do contrato (clausulas juridicas) tal como sera gerado no Word, com a possibilidade de editar campos especificos antes de baixar.

## O que muda

Atualmente a aba "Detalhes" mostra apenas campos administrativos (escopo, parcelamento, idioma). A nova aba "Pre-visualizacao" vai renderizar em HTML o conteudo completo do contrato selecionado (Regularizacion Extraordinaria, Nacionalidad ou Documentos), ja preenchido com os dados do cliente.

## Funcionalidades

1. **Nova aba "Pre-visualizacao do Contrato"** ao lado de "Detalhes" e "Beneficiarios"
2. **Renderizacao em HTML** de todas as clausulas do modelo selecionado, com:
   - Cabecalho com numero do contrato e data
   - Nome do cliente e documento ja substituidos
   - Todas as clausulas formatadas (titulos, paragrafos, listas)
   - Bloco de assinatura
3. **Campos editaveis inline** para os dados variaveis:
   - Nome do cliente (editavel)
   - Numero do documento (editavel)  
   - Numero do contrato (editavel)
   - Honorarios/forma de pagamento (campo aberto no texto)
4. **Botao "Baixar com alteracoes"** que gera o Word com os dados editados

## Fluxo do Usuario

1. Acessa a pagina de detalhes do contrato
2. Clica na aba "Pre-visualizacao"
3. Ve o contrato completo renderizado em HTML, com dados do cliente preenchidos
4. Se necessario, clica em "Editar Pre-visualizacao" para ajustar campos
5. Clica em "Baixar Contrato Word" para gerar o .docx com as alteracoes

## Detalhes Tecnicos

### 1. Criar componente `src/components/contracts/ContractPreview.tsx`

Novo componente que:
- Recebe o template selecionado e dados do cliente
- Renderiza em HTML as clausulas correspondentes (reutilizando o texto de `generate-contract.ts`)
- Exibe campos editaveis (inputs inline) para nome, documento, numero do contrato
- Possui estado local para campos editados
- Botao para baixar o Word com os dados editados

### 2. Refatorar `src/lib/generate-contract.ts`

Extrair o conteudo textual de cada template para uma funcao separada `getContractSections(template)` que retorna um array de secoes com titulo e conteudo. Isso permite:
- Reutilizar o texto tanto para gerar o Word quanto para renderizar o HTML
- Manter uma unica fonte de verdade para o conteudo dos contratos

### 3. Atualizar `src/pages/contracts/ContractDetail.tsx`

- Adicionar a nova aba "Pre-visualizacao" no `TabsList`
- Renderizar o componente `ContractPreview` dentro do `TabsContent`
- Passar os dados do contrato e cliente como props

### Arquivos envolvidos

| Arquivo | Acao |
|---------|------|
| `src/components/contracts/ContractPreview.tsx` | **Novo** - Componente de pre-visualizacao |
| `src/lib/generate-contract.ts` | Refatorar para extrair secoes de texto reutilizaveis |
| `src/pages/contracts/ContractDetail.tsx` | Adicionar aba "Pre-visualizacao" |

## Resultado Esperado

O usuario podera ver o contrato completo formatado diretamente na pagina, sem precisar baixar o Word primeiro. Campos variaveis (nome, documento, honorarios) serao editaveis inline, e o botao "Baixar" gera o documento com as alteracoes aplicadas.
