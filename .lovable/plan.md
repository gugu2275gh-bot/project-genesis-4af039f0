

# Plano: SLA de Contato Inicial do Técnico ✅ IMPLEMENTADO

## Contexto

Após a confirmação do contrato e pagamento, o caso é criado com status `CONTATO_INICIAL`. O técnico responsável deve entrar em contato com o cliente em até **24 horas úteis** (internamente), com prazo máximo de **72 horas** informado ao cliente.

---

## Regras de Negócio

| Etapa | Prazo | Ação |
|-------|-------|------|
| **Lembrete ao Técnico** | A cada 24h | Notificação interna enquanto status = CONTATO_INICIAL |
| **Escalonamento Coordenador** | 72h sem contato | Notificar MANAGER (Coordenador) |
| **Escalonamento ADM** | 72h + 48h = 5 dias úteis | Notificar ADMIN para intervenção |

---

## O Que Já Existe

| Item | Status |
|------|--------|
| Tabela `service_cases` com `technical_status` | ✅ Existe |
| Status `CONTATO_INICIAL` | ✅ Existe |
| Campo `created_at` para calcular tempo | ✅ Existe |
| Campo `assigned_to_user_id` | ✅ Existe |
| Tabela `user_roles` com roles | ✅ Existe |
| Roles ADMIN, MANAGER, TECNICO | ✅ Definidas |
| Sistema de notificações | ✅ Existe |
| Edge Function `sla-automations` | ✅ Existe |
| Automação tipo TECHNICAL | ✅ Existe (parcial) |

---

## O Que Precisa Ser Criado

### 1. Tabela de Controle de Alertas

Nova tabela para rastrear lembretes enviados (evitar duplicatas):

```sql
CREATE TABLE public.initial_contact_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_case_id UUID REFERENCES public.service_cases(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL, -- D1, D2, D3, COORD_72H, ADM_5D
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(service_case_id, reminder_type)
);
```

**Tipos de lembrete:**
- `D1` - Primeiro dia sem contato (24h)
- `D2` - Segundo dia sem contato (48h)  
- `D3` - Terceiro dia sem contato (72h) + notifica técnico
- `COORD_72H` - Escalonamento para Coordenador (72h)
- `ADM_5D` - Escalonamento para Admin (5 dias úteis)

---

### 2. Adicionar Campo de Data de Primeiro Contato

Novo campo para registrar quando o técnico fez o contato:

```sql
ALTER TABLE public.service_cases 
ADD COLUMN first_contact_at TIMESTAMP WITH TIME ZONE;
```

---

### 3. Nova Automação na Edge Function

Adicionar novo tipo de automação `INITIAL_CONTACT`:

```text
Automação: INITIAL_CONTACT

Para cada caso com status = 'CONTATO_INICIAL':

1. Calcular horas desde created_at
2. Se >= 24h e reminder D1 não enviado:
   → Notificar técnico atribuído (ou todos TECNICO se não atribuído)
   → Registrar reminder D1

3. Se >= 48h e reminder D2 não enviado:
   → Notificar técnico novamente
   → Registrar reminder D2

4. Se >= 72h:
   a) Se reminder D3 não enviado → Notificar técnico
   b) Se COORD_72H não enviado → Notificar todos MANAGER
   → Registrar reminders

5. Se >= 120h (5 dias úteis) e ADM_5D não enviado:
   → Notificar todos ADMIN
   → Registrar reminder ADM_5D
```

---

### 4. Atualização Automática ao Fazer Contato

Quando o técnico clicar em "Iniciar Contato" e atualizar para `AGUARDANDO_DOCUMENTOS`:
- Registrar `first_contact_at = now()`
- Calcular `response_time_hours` para métricas

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Adicionar automação INITIAL_CONTACT |
| `src/hooks/useCases.ts` | Atualizar `first_contact_at` ao mudar status |
| `src/pages/cases/CaseDetail.tsx` | Mostrar indicador visual de SLA (tempo aguardando) |

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| Migração SQL | Criar tabela `initial_contact_reminders` e campo `first_contact_at` |

---

## Fluxo Visual

```text
+---------------------+     +------------------+     +-------------------+
| Case criado         |     | 24h sem contato  |     | 72h sem contato   |
| status: CONTATO_    | --> | Notifica técnico | --> | Notifica técnico  |
| INICIAL             |     | (D1)             |     | + Coordenador     |
+---------------------+     +------------------+     +-------------------+
                                                              |
                                                              v
                            +------------------+     +-------------------+
                            | 5 dias sem       | <-- | 48h após (D+5)    |
                            | contato          |     | Notifica ADMIN    |
                            +------------------+     +-------------------+
```

---

## Indicador Visual no CaseDetail

Adicionar badge mostrando tempo aguardando contato:

- **Verde**: < 24h
- **Amarelo**: 24-72h (alerta para técnico)
- **Vermelho**: > 72h (escalonado)

---

## Notificações Geradas

| Evento | Destinatário | Tipo | Mensagem |
|--------|--------------|------|----------|
| 24h sem contato | Técnico atribuído | `initial_contact_reminder` | "Caso X aguarda contato inicial há 24h" |
| 48h sem contato | Técnico atribuído | `initial_contact_reminder` | "URGENTE: Caso X aguarda contato há 48h" |
| 72h sem contato | Técnico + MANAGER | `initial_contact_escalation` | "ESCALONAMENTO: Caso X sem contato há 72h" |
| 5 dias sem contato | ADMIN | `initial_contact_critical` | "CRÍTICO: Caso X sem contato há 5 dias" |

---

## Detalhes Técnicos

### Lógica da Automação (Edge Function)

```typescript
// Nova automação INITIAL_CONTACT
if (shouldRun('INITIAL_CONTACT')) {
  console.log('Running INITIAL_CONTACT automation...')
  
  const { data: pendingContacts } = await supabase
    .from('service_cases')
    .select(`
      id, created_at, assigned_to_user_id,
      opportunities!inner (leads!inner (contacts!inner (full_name)))
    `)
    .eq('technical_status', 'CONTATO_INICIAL')
  
  for (const sc of pendingContacts || []) {
    const hoursWaiting = (now.getTime() - new Date(sc.created_at).getTime()) / (60 * 60 * 1000)
    
    // Helper para verificar se reminder já foi enviado
    const reminderSent = async (type: string) => {
      const { data } = await supabase
        .from('initial_contact_reminders')
        .select('id')
        .eq('service_case_id', sc.id)
        .eq('reminder_type', type)
        .maybeSingle()
      return !!data
    }
    
    // D1: 24h
    if (hoursWaiting >= 24 && !(await reminderSent('D1'))) {
      // Notificar técnico...
    }
    
    // D2: 48h
    if (hoursWaiting >= 48 && !(await reminderSent('D2'))) {
      // Notificar técnico urgente...
    }
    
    // D3 + Coordenador: 72h
    if (hoursWaiting >= 72) {
      if (!(await reminderSent('D3'))) {
        // Notificar técnico...
      }
      if (!(await reminderSent('COORD_72H'))) {
        // Notificar todos MANAGER...
      }
    }
    
    // ADM: 120h (5 dias)
    if (hoursWaiting >= 120 && !(await reminderSent('ADM_5D'))) {
      // Notificar todos ADMIN...
    }
  }
}
```

---

## Resultado Esperado

1. **Técnicos** recebem lembretes a cada 24h enquanto não fizerem contato
2. **Coordenadores** são alertados após 72h sem contato
3. **Administradores** são alertados após 5 dias para intervenção
4. **Dashboard** mostra visualmente quais casos estão atrasados
5. **Métricas** registram tempo de resposta para relatórios

---

## Próximos Passos

Após implementar este SLA, seguiremos com:
- Lembretes de documentação
- Escalonamento técnico → jurídico
- Alertas de protocolo

