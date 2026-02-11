
# Geracão Automatica de Contratos Word (.docx) com Preenchimento de Dados do Cliente

## Resumo

Ao criar um contrato, o usuario seleciona a oportunidade e um dos 3 modelos de contrato. O sistema gera automaticamente um arquivo Word (.docx) com os dados do cliente (nome, documento, data, numero do contrato) ja preenchidos, disponibilizando o download imediato.

## Os 3 Modelos de Contrato

| Modelo | Descricao | Uso |
|--------|-----------|-----|
| Regularizacion Extraordinaria | Contrato para tramite de regularizacao excepcional | Processos de regularizacao |
| Nacionalidad | Contrato para nacionalidade espanhola por residencia | Processos de nacionalidade |
| Documentos | Contrato generico para solicitudes de documentos/certificados | Outros tramites documentais |

## Campos Preenchidos Automaticamente

Os seguintes campos serao substituidos nos templates com dados do banco:

- **N. CONTRATO**: Numero sequencial do contrato (`contract_number`)
- **Data**: Data atual formatada (ex: "11 de febrero de 2026")
- **CLIENTE (Nome)**: `contacts.full_name` (em maiusculas)
- **DOCUMENTO (PASAPORTE / NIE / DNI / NIF)**: `contacts.document_number`

## Mudancas no Fluxo

1. **Dialog "Novo Contrato"** (ContractsList.tsx): Adicionar o terceiro modelo "Documentos Actualizado" ao seletor de templates
2. **Geracao do .docx**: Criar funcao `generate-contract.ts` que monta o documento Word usando a lib `docx` (ja instalada) com o conteudo completo de cada template
3. **Botao "Baixar Contrato"** no ContractDetail.tsx: Permitir gerar/baixar o Word preenchido a qualquer momento

## Detalhes Tecnicos

### 1. Atualizar o tipo `ContractTemplate` (src/types/database.ts)

Adicionar o novo template:
```
export type ContractTemplate = 'NACIONALIDADE' | 'REGULARIZACION_EXTRAORDINARIA' | 'DOCUMENTOS';
```

Atualizar labels:
```
export const CONTRACT_TEMPLATE_LABELS = {
  NACIONALIDADE: 'Nacionalidad',
  REGULARIZACION_EXTRAORDINARIA: 'Regularizacion Extraordinaria',
  DOCUMENTOS: 'Documentos / Certificados',
};
```

Nota: O template `GENERICO` sera descontinuado em favor dos 3 modelos especificos. Contratos existentes com `GENERICO` continuarao exibindo normalmente.

### 2. Criar `src/lib/generate-contract.ts`

Nova funcao que usa a lib `docx` (mesma usada em `generate-journey-document.ts`) para montar o documento Word completo:

- Recebe: `{ template, clientName, documentNumber, contractNumber, date }`
- Contem o texto integral de cada um dos 3 contratos (copiados dos arquivos Word analisados)
- Substitui os placeholders pelos dados reais
- Gera e faz download do .docx via `file-saver`

A estrutura sera:
- Header com logo (imagem da CB Asesoria ja em `src/assets/`)
- Cabecalho com numero do contrato e data
- Todas as clausulas do modelo selecionado
- Rodape "Sus tramites en buenas manos"

### 3. Atualizar `ContractsList.tsx`

- Trocar os 2 templates atuais pelos 3 novos no dialog de criacao
- Apos criar o contrato, oferecer download automatico do Word gerado

### 4. Atualizar `ContractDetail.tsx`

- Adicionar botao "Baixar Contrato Word" no cabecalho
- Ao clicar, gera o .docx preenchido com os dados atuais do contrato/cliente
- Atualizar o seletor de templates para os 3 novos modelos

### 5. Migracao de dados

- Contratos existentes com template `GENERICO` ou `NACIONALIDADE` serao mapeados automaticamente no codigo (sem migracao de banco necessaria)

## Arquivos Envolvidos

| Arquivo | Acao |
|---------|------|
| `src/types/database.ts` | Atualizar tipo e labels do ContractTemplate |
| `src/lib/generate-contract.ts` | **Novo** - Funcao de geracao do Word |
| `src/pages/contracts/ContractsList.tsx` | Atualizar seletor de template (3 opcoes) |
| `src/pages/contracts/ContractDetail.tsx` | Adicionar botao de download do Word |
| `pages/contracts/ContractsList.tsx` | Atualizar seletor (arquivo duplicado na raiz) |

## Resultado Esperado

1. Usuario clica "Novo Contrato"
2. Seleciona a oportunidade
3. Seleciona um dos 3 modelos: Regularizacion Extraordinaria, Nacionalidad, ou Documentos
4. Clica "Criar Contrato"
5. O contrato e criado no banco e um arquivo Word (.docx) e gerado automaticamente com nome, documento e numero preenchidos
6. Na pagina do contrato, ha um botao para regenerar/baixar o Word a qualquer momento
