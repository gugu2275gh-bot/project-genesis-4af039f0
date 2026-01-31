

# Plano: Melhorias no Fluxo de Caixa (Livro Caixa)

## Resumo da Análise

Após análise do código e banco de dados, identifiquei a estrutura atual e os gaps a serem preenchidos.

### Estrutura Atual

**Categorias de Entrada (OK):**
- SERVICOS ✅
- COMISSAO_RECEBIDA ✅
- APORTE ✅ (aportes de sócios)
- OUTROS ✅

**Categorias de Saída (Parcialmente OK):**
- DESPESA_FIXA ✅ (com subcategorias)
- DESPESA_VARIAVEL ✅ (mas SEM subcategorias na UI)
- COMISSAO_PAGA ✅
- TAXA_OFICIAL ✅
- OUTROS ✅

**Subcategorias Cadastradas (`expense_categories`):**
| Tipo | Cadastradas |
|------|-------------|
| FIXA | Adobe, Aluguel, Contabilidade, Internet, Telefone |
| VARIAVEL | Marketing, Material Escritório, Outros, Taxas Oficiais, Tradutor |

---

## Gaps Identificados

### 1. Subcategorias Faltantes

**Despesas Fixas que precisam ser adicionadas:**
- Água
- Luz/Electricidade
- Salários
- Seguridade Social (encargos)
- Gestoria (contabilidade terceirizada - renomear "Contabilidade")
- Domínio/Google (serviços cloud)

**Despesas Variáveis que precisam ser adicionadas:**
- Acqua Service (água/café escritório)
- Notaría (custos cartoriais)
- Taxas Bancárias
- Mercadona (suprimentos/alimentação)

### 2. Categoria Especial: Transferências/Outros

Precisa de categoria específica para:
- Transferências entre contas da empresa
- Pró-labore/retiradas dos sócios
- Reembolsos específicos

### 3. UI: Subcategorias de Variáveis

Atualmente o seletor de subcategoria só aparece quando `category === 'DESPESA_FIXA'`. Precisa aparecer também para `DESPESA_VARIAVEL`.

### 4. Relatório Consolidado

Adicionar cards resumo separando:
- Total Despesas Fixas
- Total Despesas Variáveis
- Margem/Lucro

---

## Alterações no Banco de Dados

### 1. Inserir Subcategorias Faltantes

```sql
INSERT INTO expense_categories (name, type, description, is_active) VALUES
  -- Despesas Fixas faltantes
  ('Água', 'FIXA', 'Conta de água', true),
  ('Luz', 'FIXA', 'Conta de eletricidade', true),
  ('Salários', 'FIXA', 'Salários de funcionários', true),
  ('Seguridade Social', 'FIXA', 'Encargos sociais', true),
  ('Gestoria', 'FIXA', 'Contabilidade terceirizada', true),
  ('Domínio/Google', 'FIXA', 'Serviços de email e cloud', true),
  
  -- Despesas Variáveis faltantes
  ('Acqua Service', 'VARIAVEL', 'Água e café para escritório', true),
  ('Notaría', 'VARIAVEL', 'Custos com cartório', true),
  ('Taxas Bancárias', 'VARIAVEL', 'Taxas de manutenção e transferências', true),
  ('Mercadona', 'VARIAVEL', 'Suprimentos e alimentação', true),
  ('Comissões Pagas', 'VARIAVEL', 'Comissões a colaboradores', true);

-- Renomear "Contabilidade" para "Contabilidade Interna" para diferenciar de Gestoria
UPDATE expense_categories 
SET name = 'Contabilidade Interna', description = 'Custos contábeis internos'
WHERE name = 'Contabilidade';
```

---

## Alterações na UI

### 1. Atualizar Categorias de Saída

Adicionar nova categoria para transferências/movimentações internas:

```typescript
const EXIT_CATEGORIES = [
  { value: 'DESPESA_FIXA', label: 'Despesa Fixa' },
  { value: 'DESPESA_VARIAVEL', label: 'Despesa Variável' },
  { value: 'COMISSAO_PAGA', label: 'Comissão Paga' },
  { value: 'TAXA_OFICIAL', label: 'Taxa Oficial' },
  { value: 'TRANSFERENCIA_INTERNA', label: 'Transferência Interna' },
  { value: 'PRO_LABORE', label: 'Pró-Labore / Retirada' },
  { value: 'OUTROS', label: 'Outros' },
];
```

### 2. Habilitar Subcategorias para Variáveis

Modificar a condição do seletor de subcategoria:

```typescript
// DE:
{formData.type === 'SAIDA' && formData.category === 'DESPESA_FIXA' && (

// PARA:
{formData.type === 'SAIDA' && 
  (formData.category === 'DESPESA_FIXA' || formData.category === 'DESPESA_VARIAVEL') && (
```

E filtrar corretamente as subcategorias:

```typescript
{categories
  .filter(c => 
    formData.category === 'DESPESA_FIXA' ? c.type === 'FIXA' : c.type === 'VARIAVEL'
  )
  .map((cat) => (
    <SelectItem key={cat.id} value={cat.name}>
      {cat.name}
    </SelectItem>
  ))
}
```

### 3. Adicionar Cards de Resumo por Tipo de Despesa

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  RESUMO FINANCEIRO DO PERÍODO                                               │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────│
│ Total Entradas  │ Despesas Fixas  │ Despesas Variáveis │ SALDO/MARGEM    │
│   €X.XXX,XX     │   €X.XXX,XX     │     €X.XXX,XX      │  €X.XXX,XX      │
│   ▲ Receitas    │   ▼ Recorrentes │     ▼ Operacionais │  ✓ ou ✗         │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────┘
```

### 4. Adicionar Gráfico de Composição (Opcional)

Usar Recharts (já instalado) para visualização:
- Gráfico de pizza: Composição das despesas (Fixas vs Variáveis)
- Gráfico de barras: Evolução mensal (receitas vs despesas)

---

## Fluxo Visual Proposto

```text
   FINANCEIRO REGISTRA LANÇAMENTO
                │
                ▼
   ┌────────────────────────────────────┐
   │ Tipo: ENTRADA ou SAÍDA             │
   └────────────────────────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
    ENTRADA            SAÍDA
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────────────┐
│ Categorias:  │  │ Categorias:          │
│ • Serviços   │  │ • Despesa Fixa       │
│ • Comissão   │  │ • Despesa Variável   │
│   Recebida   │  │ • Comissão Paga      │
│ • Aporte     │  │ • Taxa Oficial       │
│ • Outros     │  │ • Transf. Interna    │
└──────────────┘  │ • Pró-Labore         │
                  │ • Outros             │
                  └──────────────────────┘
                           │
                           ▼
                  ┌──────────────────────┐
                  │ Se Fixa/Variável:    │
                  │ Selecionar Subcateg. │
                  │ (Adobe, Aluguel,     │
                  │  Tradutor, etc.)     │
                  └──────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/finance/CashFlow.tsx` | Atualizar EXIT_CATEGORIES, habilitar subcategorias para variáveis, adicionar cards de resumo |
| `src/hooks/useCashFlow.ts` | Adicionar cálculos separados para fixas e variáveis |

---

## Cálculos Adicionais no Hook

```typescript
// Adicionar ao useCashFlow:

const totalDespesasFixas = entries
  .filter(e => e.type === 'SAIDA' && e.category === 'DESPESA_FIXA')
  .reduce((sum, e) => sum + e.amount, 0);

const totalDespesasVariaveis = entries
  .filter(e => e.type === 'SAIDA' && e.category === 'DESPESA_VARIAVEL')
  .reduce((sum, e) => sum + e.amount, 0);

const margemOperacional = totalEntradas - totalDespesasFixas - totalDespesasVariaveis;
```

---

## Lista Completa de Subcategorias

### Despesas Fixas
| Subcategoria | Descrição |
|--------------|-----------|
| Adobe | Assinatura de software |
| Água | Conta de água |
| Luz | Conta de eletricidade |
| Internet | Serviço de internet (Fibra) |
| Telefone | Linhas telefônicas |
| Aluguel | Aluguel do escritório |
| Salários | Salários de funcionários |
| Seguridade Social | Encargos sociais |
| Gestoria | Contabilidade terceirizada |
| Domínio/Google | Serviços de email e cloud |
| Contabilidade Interna | Custos contábeis internos |

### Despesas Variáveis
| Subcategoria | Descrição |
|--------------|-----------|
| Tradutor | Serviços de tradução |
| Material Escritório | Suprimentos e papelaria |
| Marketing | Publicidade e marketing |
| Acqua Service | Água e café para escritório |
| Mercadona | Suprimentos e alimentação |
| Notaría | Custos com cartório |
| Taxas Oficiais | Taxas pagas a órgãos |
| Taxas Bancárias | Taxas de manutenção e transferências |
| Comissões Pagas | Comissões a colaboradores |
| Outros | Despesas diversas |

---

## Testes Recomendados

1. Registrar despesa fixa com subcategoria (ex: Adobe)
2. Registrar despesa variável com subcategoria (ex: Tradutor)
3. Verificar que os totais separados (Fixas vs Variáveis) estão corretos
4. Registrar transferência interna e verificar categorização
5. Verificar relatório consolidado com gráficos
6. Filtrar por período e verificar que os cálculos atualizam

---

## Benefícios

- **Organização completa**: Todas as categorias reais do negócio mapeadas
- **Visão clara**: Separação entre custos fixos e variáveis
- **Controle operacional**: Facilita identificar onde cortar custos
- **Relatórios**: Base para análise financeira e projeções
- **Conciliação**: Saldo de caixa e lucro/prejuízo visíveis

