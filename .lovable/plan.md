
# Plano: Fluxo de Retirada de TIE com Cita Previa e Finalizacao do Caso

## Visao Geral

Implementar o fluxo completo para casos onde **E necessario agendamento** para retirada do TIE, incluindo:
1. Orientacao ao cliente sobre disponibilidade para agendar
2. Registro da data/hora da cita de retirada
3. Lembretes pre-cita (D-3, D-1)
4. Apos a data da cita: verificacao a cada 3 dias perguntando se retirou o TIE
5. Mensagem final de encerramento e arquivamento do caso

---

## Fluxo Detalhado

```text
TIE Disponivel (requer cita)
         │
         ▼
┌─────────────────────────────────────────┐
│ Tecnico solicita disponibilidade ao     │
│ cliente para agendar retirada           │
│ (similar ao fluxo de huellas)           │
└─────────────────────────────────────────┘
         │
         ▼ (Cliente informa disponibilidade)
┌─────────────────────────────────────────┐
│ Tecnico agenda cita e registra:         │
│ • Data / Hora / Local                   │
│ Status → AGUARDANDO_CITA_RETIRADA       │
└─────────────────────────────────────────┘
         │
         ▼ (D-3, D-1 antes da cita)
┌─────────────────────────────────────────┐
│ Sistema envia lembretes automaticos:    │
│ • D-3: Lembrete com instrucoes          │
│ • D-1: Lembrete final                   │
└─────────────────────────────────────────┘
         │
         ▼ (Apos data da cita)
┌─────────────────────────────────────────┐
│ A cada 3 dias, sistema pergunta:        │
│ "Voce conseguiu retirar o TIE?"         │
│ (ate confirmacao ou resposta)           │
└─────────────────────────────────────────┘
         │
         ▼ (Cliente confirma retirada)
┌─────────────────────────────────────────┐
│ Tecnico marca TIE como retirado         │
│ Status → TIE_RETIRADO                   │
└─────────────────────────────────────────┘
         │
         ▼ (Finalizacao)
┌─────────────────────────────────────────┐
│ Tecnico encerra caso                    │
│ Status → ENCERRADO_APROVADO             │
│ • Mensagem final agradecendo cliente    │
│ • Caso arquivado com dados historicos   │
│ • Notificacao NPS (ja implementado)     │
└─────────────────────────────────────────┘
```

---

## 1. Lembretes Pre-Cita de Retirada (D-3, D-1)

### Edge Function `sla-automations`

Adicionar nova secao para casos com `AGUARDANDO_CITA_RETIRADA`:

**Logica:**
- Buscar casos com `tie_pickup_appointment_date` futuro
- D-3: Enviar lembrete com instrucoes completas
- D-1: Enviar lembrete final urgente

**Templates:**

| Template | Mensagem |
|----------|----------|
| `template_tie_pickup_d3` | Ola {nome}! Lembrete: sua cita para retirada do TIE esta marcada para {data} as {hora}. Local: {local}. Leve: Passaporte, Resguardo e Taxa 790. |
| `template_tie_pickup_d1` | Ola {nome}! Amanha e sua cita de retirada do TIE! {hora} em {local}. Documentos: Passaporte, Resguardo, Taxa 790. Boa sorte! |

---

## 2. Verificacao Pos-Cita (A cada 3 dias)

### Nova Logica na Edge Function

Apos a data da cita passar e `tie_picked_up = false`:

**Ciclo de verificacao:**
- D+3 apos cita: "Voce conseguiu retirar o TIE?"
- D+6 apos cita: Segundo lembrete
- D+9 apos cita: Terceiro lembrete
- D+12+: Alertar tecnico internamente

**Template:**
```
Ola {nome}! Sua cita de retirada do TIE era dia {data}. 
Voce conseguiu retirar seu documento com sucesso? 
Por favor, confirme para darmos continuidade ao seu processo.
```

**Tracking:** Usar `tie_pickup_reminders` com tipo `POST_CITA_D3`, `POST_CITA_D6`, etc.

---

## 3. Mensagem Final de Encerramento

### Ao Marcar Caso como Encerrado

Quando `closeCase` for executado com resultado `APROVADO`:

1. Enviar WhatsApp de agradecimento
2. Criar notificacao no portal (NPS ja existe)
3. Registrar mensagem no CRM

**Template Final:**
```
Parabens, {nome}! Seu processo foi concluido com sucesso!

Agradecemos a confianca depositada na CB Asesoria. Foi um prazer
atende-lo(a). Seu TIE e valido ate {validade_tie}.

Para futuras necessidades (renovacoes, familiares, etc.), estamos
a disposicao. Ate breve!
```

---

## 4. Alteracoes no Banco de Dados

### Novos Templates em `system_config`

| Chave | Valor |
|-------|-------|
| `template_tie_pickup_d3` | Lembrete D-3 |
| `template_tie_pickup_d1` | Lembrete D-1 |
| `template_tie_post_cita_verification` | Pergunta pos-cita |
| `template_case_closure_success` | Mensagem final |

### Migracao SQL

```sql
INSERT INTO system_config (key, value) VALUES
('template_tie_pickup_d3', 'Ola {nome}! Lembrete: sua cita para retirada do TIE esta marcada para {data} as {hora}. Local: {local}. Leve: Passaporte, Resguardo e Taxa 790.'),
('template_tie_pickup_d1', 'Ola {nome}! Amanha e sua cita de retirada do TIE! {hora} em {local}. Documentos: Passaporte, Resguardo, Taxa 790. Boa sorte!'),
('template_tie_post_cita_verification', 'Ola {nome}! Sua cita de retirada do TIE era dia {data}. Voce conseguiu retirar seu documento com sucesso? Por favor, confirme para darmos continuidade.'),
('template_case_closure_success', 'Parabens, {nome}! Seu processo foi concluido com sucesso! Agradecemos a confianca. Seu TIE e valido ate {validade_tie}. Para futuras necessidades, estamos a disposicao!')
ON CONFLICT (key) DO NOTHING;
```

---

## 5. Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Adicionar secao TIE_PICKUP_APPOINTMENT para lembretes D-3/D-1 e verificacao pos-cita |
| `src/hooks/useCases.ts` | Modificar `closeCase` para enviar WhatsApp final |
| `src/components/cases/TiePickupSection.tsx` | Adicionar validacao de antecedencia minima (1 semana) |
| `.lovable/plan.md` | Atualizar com novo fluxo |

### Nova Migracao SQL

Adicionar templates de mensagem para o novo fluxo.

---

## 6. Validacao de Antecedencia (1 semana)

### Frontend `TiePickupSection.tsx`

Ao agendar cita de retirada, validar que a data e pelo menos 7 dias no futuro:

```typescript
const handleScheduleAppointment = () => {
  const appointmentDate = new Date(appointmentData.date);
  const today = new Date();
  const minDate = addDays(today, 7);
  
  if (appointmentDate < minDate) {
    toast({
      title: 'Data invalida',
      description: 'A cita deve ser agendada com no minimo 7 dias de antecedencia.',
      variant: 'destructive'
    });
    return;
  }
  // Continuar com agendamento...
};
```

---

## 7. Atualizacao do Hook `closeCase`

### Enviar Mensagem Final Automaticamente

```typescript
const closeCase = useMutation({
  mutationFn: async ({ id, result }: { id: string; result: 'APROVADO' | 'NEGADO' }) => {
    // ... logica existente ...
    
    // Se aprovado, enviar mensagem final de agradecimento
    if (result === 'APROVADO') {
      // Buscar dados do cliente e TIE
      const { data: caseData } = await supabase
        .from('service_cases')
        .select(`
          tie_validity_date,
          opportunities (leads (id, contacts (full_name, phone)))
        `)
        .eq('id', id)
        .single();
      
      const contact = caseData.opportunities.leads.contacts;
      const leadId = caseData.opportunities.leads.id;
      const tieValidity = caseData.tie_validity_date 
        ? format(new Date(caseData.tie_validity_date), 'dd/MM/yyyy')
        : 'consulte seu documento';
      
      const finalMessage = templateMap.template_case_closure_success
        .replace('{nome}', contact.full_name)
        .replace('{validade_tie}', tieValidity);
      
      // Enviar WhatsApp
      await supabase.functions.invoke('send-whatsapp', {
        body: { mensagem: finalMessage, numero: contact.phone }
      });
      
      // Registrar no CRM
      await supabase.from('mensagens_cliente').insert({
        id_lead: leadId,
        mensagem_IA: finalMessage,
        origem: 'SISTEMA'
      });
    }
    
    return data;
  }
});
```

---

## 8. Edge Function - Nova Secao TIE_PICKUP_APPOINTMENT

```typescript
// TIE PICKUP APPOINTMENT REMINDERS (COM CITA)
if (shouldRun('TIE_PICKUP')) {
  // ... logica existente para sem cita ...
  
  // Casos COM cita agendada
  const { data: tieCitaCases } = await supabase
    .from('service_cases')
    .select(`
      id, tie_pickup_appointment_date, tie_pickup_appointment_time,
      tie_pickup_location, tie_picked_up, client_user_id, assigned_to_user_id,
      opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
    `)
    .eq('technical_status', 'AGUARDANDO_CITA_RETIRADA')
    .eq('tie_picked_up', false)
  
  for (const sc of tieCitaCases || []) {
    const appointmentDate = new Date(sc.tie_pickup_appointment_date);
    const daysUntilAppointment = Math.floor((appointmentDate - now) / (24*60*60*1000));
    const daysSinceAppointment = Math.floor((now - appointmentDate) / (24*60*60*1000));
    
    // PRE-CITA: Lembretes D-3 e D-1
    if (daysUntilAppointment === 3) {
      // Enviar lembrete D-3
    }
    if (daysUntilAppointment === 1) {
      // Enviar lembrete D-1
    }
    
    // POS-CITA: Verificacao a cada 3 dias
    if (daysSinceAppointment >= 3) {
      const verificationCycle = Math.floor(daysSinceAppointment / 3);
      const verificationKey = `POST_CITA_D${verificationCycle * 3}`;
      
      if (!(await tieReminderSent(sc.id, verificationKey))) {
        // Enviar mensagem perguntando se retirou
        // Registrar lembrete
        // Alertar tecnico se D+12+
      }
    }
  }
}
```

---

## Resumo de Implementacao

1. ✅ **Migracao SQL** - Templates para pre-cita, pos-cita e encerramento adicionados
2. ✅ **Edge Function** - Logica para AGUARDANDO_CITA_RETIRADA (D-3, D-1, pos-cita) implementada
3. ✅ **useCases.ts** - `closeCase` envia WhatsApp final automaticamente
4. ✅ **TiePickupSection** - Validacao de antecedencia de 7 dias implementada

**Status:** IMPLEMENTADO

---

## Dados Preservados para Referencia Futura

Ao encerrar o caso, os seguintes dados ficam registrados para futuras consultas (renovacoes, familiares):

| Campo | Descricao |
|-------|-----------|
| `approval_date` | Data da aprovacao |
| `decision_date` | Data do encerramento |
| `tie_validity_date` | Validade do TIE |
| `residencia_validity_date` | Validade da residencia |
| `tie_lot_number` | Numero do lote |
| `tie_pickup_date` | Data de retirada |
| `expediente_number` | Numero do expediente |
| `protocol_number` | Numero do protocolo |
