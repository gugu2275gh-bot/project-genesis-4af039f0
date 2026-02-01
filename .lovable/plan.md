
# Plano: Relatórios Financeiros Internos

## Visao Geral

Criar uma nova pagina de **Relatórios Financeiros** (`/finance/reports`) com cinco relatórios específicos para gestao financeira interna, acessível a partir do menu Finance.

---

## Estrutura Proposta

### Nova Pagina: `src/pages/finance/FinancialReports.tsx`

Pagina principal com tabs para cada tipo de relatorio:

1. **Contratos com Saldo Pendente** - Cobranca ativa
2. **Contratos Nao Iniciados** - Atencao ao cliente
3. **Previsao de Entradas** - Fluxo futuro
4. **Faturamento Realizado** - Receita consolidada  
5. **Comissoes Devidas** - Pagamentos a colaboradores

---

## Detalhamento Tecnico

### 1. Contratos com Saldo Pendente (Cobrando/A Cobrar)

**Objetivo:** Listar contratos ASSINADOS onde `payment_status = 'INICIADO'` mas ainda tem saldo devedor

**Dados necessarios:**
- Contratos com status ASSINADO e payment_status = INICIADO
- Total de pagamentos CONFIRMADO vs total_fee
- Destaque visual para contratos em atraso (parcelas vencidas)

**Colunas:**
| Cliente | Servico | Valor Total | Pago | Saldo | Parcelas Vencidas | Proxima Parcela | Acoes |

**Acoes disponiveis:**
- Ver contrato
- Enviar cobranca WhatsApp (se em atraso)

---

### 2. Contratos Nao Iniciados (Assinados sem Pagamento)

**Objetivo:** Listar contratos ASSINADOS onde `payment_status = 'NAO_INICIADO'`

**Logica:** 
- Contrato foi assinado mas nenhum pagamento foi confirmado ainda
- Pode indicar cliente com problemas ou contrato a cancelar

**Colunas:**
| Cliente | Servico | Valor Total | Data Assinatura | Dias sem Pagamento | Primeira Parcela | Acoes |

**Acoes disponiveis:**
- Ver contrato
- Cancelar contrato (com confirmacao)
- Enviar lembrete WhatsApp

**Destaque visual:**
- Amarelo: 7-14 dias sem pagamento
- Vermelho: 15+ dias sem pagamento

---

### 3. Previsao de Entradas Futuras

**Objetivo:** Listar pagamentos PENDENTE com due_date no futuro

**Agrupamento:** Por mes (proximos 6 meses)

**Dados:**
```
Fevereiro 2026:  €5.400 (8 parcelas)
Marco 2026:      €4.200 (6 parcelas)
...
```

**Colunas detalhadas:**
| Cliente | Contrato | Parcela | Valor | Vencimento |

**Totais:**
- Total previsto proximo mes
- Total previsto 3 meses
- Total previsto 6 meses

---

### 4. Faturamento Realizado (Periodo)

**Objetivo:** Consolidar receita recebida em um periodo, separando COM e SEM fatura fiscal

**Fonte de dados:** Reutilizar logica do BillingReport.tsx existente

**Metricas:**
- Total faturado (com fatura fiscal - contas ES)
- Total recebido informal (PIX, PayPal, Dinheiro)
- IVA a recolher (21% sobre faturado)

**Filtros:**
- Periodo (data inicial/final)
- Conta de recebimento
- Com/Sem fatura

**Exportacao:** Excel e PDF

---

### 5. Comissoes Devidas a Colaboradores

**Objetivo:** Resumo de comissoes pendentes com opcao de marcar como paga

**Dados:** Reutilizar hook useCommissions

**Divisao:**
- **A Pagar (Captadores):** Comissoes que a empresa deve pagar a indicadores
- **A Receber (Fornecedores):** Comissoes que fornecedores devem a empresa

**Colunas:**
| Colaborador | Tipo | Cliente | Base | Taxa | Valor | Status | Acoes |

**Acoes:**
- Marcar como paga
- Ver detalhes

---

## Novo Hook: `useFinancialReports.ts`

```typescript
// Busca dados agregados para os relatorios financeiros
export function useFinancialReports() {
  // 1. Contratos com saldo pendente
  const contractsWithBalance = useQuery({...});
  
  // 2. Contratos nao iniciados
  const contractsNotStarted = useQuery({...});
  
  // 3. Previsao de entradas (pagamentos futuros)
  const futurePayments = useQuery({...});
  
  // Metricas calculadas
  return {
    contractsWithBalance,
    contractsNotStarted,
    futurePayments,
    // Totais
    totalPendingToCollect,
    totalFutureRevenue,
    ...
  };
}
```

---

## Navegacao

### Atualizar Sidebar

Adicionar link no menu Finance:

```
Financeiro/
  ├── Pagamentos
  ├── Fluxo de Caixa
  ├── Comissoes
  ├── Faturas
  └── Relatorios Financeiros  <-- NOVO
```

### Atualizar App.tsx

Adicionar rota:

```typescript
<Route path="/finance/reports" element={<FinancialReports />} />
```

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `src/pages/finance/FinancialReports.tsx` | Criar - Pagina principal com tabs |
| `src/hooks/useFinancialReports.ts` | Criar - Hook para queries agregadas |
| `src/components/layout/Sidebar.tsx` | Modificar - Adicionar link |
| `src/App.tsx` | Modificar - Adicionar rota |

---

## Componentes Auxiliares

### Cards de Metricas (Reutilizar StatsCard)

- Total a Receber (contratos ativos)
- Contratos em Atraso
- Previsao Proximos 30 dias
- Comissoes Pendentes

### Tabela com Acoes

Cada relatorio tera sua propria tabela com:
- Ordenacao por coluna
- Busca
- Exportacao Excel/PDF
- Acoes contextuais (ver, cobrar, cancelar)

---

## Fluxo de Dados

```
contracts (status=ASSINADO)
    │
    ├── payment_status='INICIADO' + saldo > 0 → Rel. 1 (Saldo Pendente)
    │
    └── payment_status='NAO_INICIADO' → Rel. 2 (Nao Iniciados)

payments (status=PENDENTE, due_date > hoje)
    │
    └── Agrupado por mes → Rel. 3 (Previsao)

cash_flow (type=ENTRADA, category=SERVICOS)
    │
    └── Filtrado por periodo → Rel. 4 (Faturamento)

commissions (status=PENDENTE)
    │
    └── Agrupado por tipo → Rel. 5 (Comissoes)
```

---

## Secao Tecnica

### Queries Principais

**1. Contratos com Saldo Pendente:**
```sql
SELECT c.*, 
  SUM(CASE WHEN p.status = 'CONFIRMADO' THEN p.amount ELSE 0 END) as paid,
  c.total_fee - SUM(...) as balance
FROM contracts c
LEFT JOIN payments p ON p.contract_id = c.id
WHERE c.status = 'ASSINADO' 
  AND c.payment_status = 'INICIADO'
GROUP BY c.id
HAVING balance > 0
```

**2. Contratos Nao Iniciados:**
```sql
SELECT * FROM contracts
WHERE status = 'ASSINADO'
  AND payment_status = 'NAO_INICIADO'
ORDER BY signed_at ASC
```

**3. Previsao de Entradas:**
```sql
SELECT 
  DATE_TRUNC('month', due_date) as month,
  SUM(amount) as total,
  COUNT(*) as count
FROM payments
WHERE status = 'PENDENTE'
  AND due_date >= CURRENT_DATE
GROUP BY month
ORDER BY month
```

### Dependencias Existentes Reutilizadas

- `useContracts` - Lista de contratos com pagamentos
- `usePayments` - Lista de pagamentos
- `useCommissions` - Comissoes
- `useCashFlow` - Faturamento
- `exportToExcel/PDF` - Funcoes de exportacao
- `StatsCard` - Componente de metricas
- `DataTable` - Tabela com ordenacao

---

## Estimativa de Complexidade

| Componente | Esforco |
|------------|---------|
| FinancialReports.tsx | Alto (pagina principal com 5 tabs) |
| useFinancialReports.ts | Medio (queries agregadas) |
| Sidebar/App.tsx | Baixo (apenas adicionar links) |

**Total estimado:** 1 iteracao de desenvolvimento
