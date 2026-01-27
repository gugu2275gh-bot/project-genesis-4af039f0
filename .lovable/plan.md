

# Plano: Separar Automações por Tipo com Parâmetro de Filtro

## Problema Identificado

Atualmente, quando a Edge Function `sla-automations` é chamada, ela executa TODAS as automações:
- Welcome messages
- Reengagements
- Onboarding reminders
- Contract reminders
- Payment reminders
- Daily collections
- etc.

Isso causa envio de mensagens indesejadas quando você só quer executar uma automação específica.

---

## Solução

Adicionar um parâmetro `automation_type` no body da requisição que permite escolher qual(is) automação(ões) executar.

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Adicionar lógica de filtro por tipo de automação |

---

## Detalhes da Implementação

### 1. Receber parâmetro do body

```typescript
const body = await req.json().catch(() => ({}))
const automationType = body.automation_type || 'ALL' // ALL executa tudo (comportamento atual)
```

### 2. Tipos de automação disponíveis

| Tipo | Descrição |
|------|-----------|
| `ALL` | Executa todas (comportamento atual) |
| `WELCOME` | Welcome messages |
| `REENGAGEMENT` | Reengagement de leads |
| `ARCHIVE` | Auto-arquivamento |
| `CONTRACT_REMINDERS` | Lembretes de contrato |
| `PAYMENT_PRE` | Lembretes pré-vencimento |
| `PAYMENT_POST` | Lembretes pós-vencimento |
| `DAILY_COLLECTION` | Cobrança diária (nova) |
| `ONBOARDING` | Lembretes de onboarding |
| `TIE_PICKUP` | Lembretes de retirada TIE |
| `TECHNICAL` | Alertas técnicos |
| `LEGAL` | Alertas jurídicos |
| `REQUIREMENTS` | Alertas de exigências |
| `PROTOCOL` | Lembretes de protocolo |

### 3. Lógica condicional

```typescript
// Só executa se automationType for 'ALL' ou o tipo específico
const shouldRun = (type: string) => automationType === 'ALL' || automationType === type

// Exemplo de uso:
if (shouldRun('WELCOME')) {
  // ... lógica de welcome messages
}

if (shouldRun('DAILY_COLLECTION')) {
  // ... lógica de cobrança diária
}
```

---

## Como Executar Apenas Cobrança Diária

Após a implementação, você pode chamar a função assim:

```bash
curl -X POST https://xdnliyuogkoxckbesktx.supabase.co/functions/v1/sla-automations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{"automation_type": "DAILY_COLLECTION"}'
```

Ou via ferramenta de teste:
```json
{
  "automation_type": "DAILY_COLLECTION"
}
```

---

## Cron Jobs Separados

Cada automação pode ter seu próprio schedule:

| Automação | Schedule | Horário |
|-----------|----------|---------|
| DAILY_COLLECTION | `0 9 * * *` | 09:00 diariamente |
| WELCOME | `*/15 * * * *` | A cada 15 min |
| ONBOARDING | `0 10 * * *` | 10:00 diariamente |
| PAYMENT_PRE | `0 8 * * *` | 08:00 diariamente |
| PAYMENT_POST | `0 11 * * *` | 11:00 diariamente |

---

## Fluxo Visual

```text
+------------------+     +----------------------+
| POST request     | --> | sla-automations      |
| automation_type: |     | Edge Function        |
| DAILY_COLLECTION |     +----------------------+
+------------------+              |
                                  v
                    +---------------------------+
                    | if shouldRun('DAILY_..') |
                    |   -> executa cobrança    |
                    +---------------------------+
                                  |
                                  v
                    +---------------------------+
                    | Pula todas as outras     |
                    | automações               |
                    +---------------------------+
```

---

## Resultado

1. Você poderá executar APENAS a cobrança diária agora sem acionar outras automações
2. Cada automação pode ser agendada em horários diferentes
3. Mantém compatibilidade - chamar sem parâmetro executa tudo (para cron existentes)

