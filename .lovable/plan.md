

# Plano: Suspensão de Contrato e Caso Técnico por Inadimplência

## Objetivo

Permitir que o Financeiro:
1. **Suspenda** um contrato por inadimplência (e automaticamente suspenda o caso técnico relacionado)
2. **Reative** um contrato suspenso (e automaticamente reative o caso técnico)

---

## Análise da Infraestrutura Existente

### Estrutura Atual

| Tabela | Campos Relevantes |
|--------|-------------------|
| `contracts` | `status`, `opportunity_id`, `cancellation_reason` |
| `service_cases` | `opportunity_id`, `technical_status` |

### Relacionamento

```text
contracts.opportunity_id → service_cases.opportunity_id
```

Um contrato está vinculado a um caso técnico através do `opportunity_id`.

---

## Alterações no Banco de Dados

### 1. Adicionar campos de suspensão na tabela `contracts`

```sql
ALTER TABLE contracts 
ADD COLUMN is_suspended boolean DEFAULT false,
ADD COLUMN suspended_at timestamptz,
ADD COLUMN suspended_by uuid REFERENCES auth.users(id),
ADD COLUMN suspension_reason text;
```

### 2. Adicionar campos de suspensão na tabela `service_cases`

```sql
ALTER TABLE service_cases 
ADD COLUMN is_suspended boolean DEFAULT false,
ADD COLUMN suspended_at timestamptz,
ADD COLUMN suspended_by uuid REFERENCES auth.users(id),
ADD COLUMN suspension_reason text;
```

---

## Fluxo Visual

```text
   FINANCEIRO IDENTIFICA INADIMPLÊNCIA
                │
                ▼
   ┌────────────────────────────────────┐
   │ Clica em "Suspender por            │
   │ Inadimplência" na página de        │
   │ detalhes do contrato               │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ Dialog: Motivo da Suspensão        │
   │ (Campo obrigatório)                │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ 1. Contrato: is_suspended = true   │
   │ 2. Buscar service_case pelo        │
   │    opportunity_id                  │
   │ 3. Caso Técnico: is_suspended=true │
   │ 4. Notificar Técnico responsável   │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ Visual: Badge "SUSPENSO" em        │
   │ vermelho no contrato e caso        │
   └────────────────────────────────────┘
```

### Fluxo de Reativação

```text
   FINANCEIRO DECIDE REATIVAR
                │
                ▼
   ┌────────────────────────────────────┐
   │ Clica em "Reativar Contrato"       │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ 1. Contrato: is_suspended = false  │
   │    limpa suspended_at/by/reason    │
   │ 2. Caso Técnico: is_suspended=false│
   │ 3. Notificar Técnico               │
   └────────────────────────────────────┘
```

---

## Alterações no Código

### 1. Adicionar mutations no `useContracts.ts`

```typescript
const suspendContract = useMutation({
  mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
    // 1. Suspender contrato
    const { data: contract, error } = await supabase
      .from('contracts')
      .update({
        is_suspended: true,
        suspended_at: new Date().toISOString(),
        suspended_by: user?.id,
        suspension_reason: reason,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;

    // 2. Buscar e suspender caso técnico
    const { data: serviceCase } = await supabase
      .from('service_cases')
      .select('id, assigned_to_user_id')
      .eq('opportunity_id', contract.opportunity_id)
      .maybeSingle();

    if (serviceCase) {
      await supabase.from('service_cases')
        .update({
          is_suspended: true,
          suspended_at: new Date().toISOString(),
          suspended_by: user?.id,
          suspension_reason: reason,
        })
        .eq('id', serviceCase.id);

      // 3. Notificar técnico
      if (serviceCase.assigned_to_user_id) {
        await supabase.from('notifications').insert({
          user_id: serviceCase.assigned_to_user_id,
          title: 'Caso Suspenso por Inadimplência',
          message: `O caso foi suspenso pelo Financeiro: ${reason}`,
          type: 'case_suspended',
        });
      }
    }

    return contract;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
    queryClient.invalidateQueries({ queryKey: ['service-cases'] });
    toast({ title: 'Contrato suspenso por inadimplência' });
  },
});

const reactivateContract = useMutation({
  mutationFn: async (id: string) => {
    // 1. Reativar contrato
    const { data: contract, error } = await supabase
      .from('contracts')
      .update({
        is_suspended: false,
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;

    // 2. Reativar caso técnico
    const { data: serviceCase } = await supabase
      .from('service_cases')
      .select('id, assigned_to_user_id')
      .eq('opportunity_id', contract.opportunity_id)
      .maybeSingle();

    if (serviceCase) {
      await supabase.from('service_cases')
        .update({
          is_suspended: false,
          suspended_at: null,
          suspended_by: null,
          suspension_reason: null,
        })
        .eq('id', serviceCase.id);

      // 3. Notificar técnico
      if (serviceCase.assigned_to_user_id) {
        await supabase.from('notifications').insert({
          user_id: serviceCase.assigned_to_user_id,
          title: 'Caso Reativado',
          message: 'O caso foi reativado pelo Financeiro. Você pode continuar o processo.',
          type: 'case_reactivated',
        });
      }
    }

    return contract;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
    queryClient.invalidateQueries({ queryKey: ['service-cases'] });
    toast({ title: 'Contrato reativado com sucesso' });
  },
});
```

### 2. Adicionar UI no `ContractDetail.tsx`

**Botões condicionais:**

```typescript
{/* Botão Suspender - somente se não está suspenso e contrato está ASSINADO */}
{contract.status === 'ASSINADO' && !contract.is_suspended && (
  <Button variant="destructive" onClick={() => setShowSuspendDialog(true)}>
    <Pause className="h-4 w-4 mr-2" />
    Suspender por Inadimplência
  </Button>
)}

{/* Botão Reativar - somente se está suspenso */}
{contract.is_suspended && (
  <Button variant="default" onClick={handleReactivate}>
    <Play className="h-4 w-4 mr-2" />
    Reativar Contrato
  </Button>
)}
```

**Badge de Suspenso no cabeçalho:**

```typescript
{contract.is_suspended && (
  <Badge variant="destructive" className="ml-2">
    <AlertTriangle className="h-3 w-3 mr-1" />
    SUSPENSO
  </Badge>
)}
```

**Dialog de Suspensão:**

```typescript
<Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Suspender Contrato por Inadimplência</DialogTitle>
      <DialogDescription>
        Isso irá suspender tanto o contrato quanto o caso técnico associado.
        O técnico responsável será notificado.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <div>
        <Label>Motivo da Suspensão *</Label>
        <Textarea
          value={suspensionReason}
          onChange={(e) => setSuspensionReason(e.target.value)}
          placeholder="Descreva o motivo da suspensão..."
          rows={3}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
        Cancelar
      </Button>
      <Button 
        variant="destructive" 
        onClick={handleSuspend}
        disabled={!suspensionReason.trim() || suspendContract.isPending}
      >
        Confirmar Suspensão
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 3. Adicionar indicador visual no `CaseDetail.tsx`

**Alerta no topo da página quando caso está suspenso:**

```typescript
{serviceCase.is_suspended && (
  <Alert variant="destructive" className="mb-4">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Caso Suspenso por Inadimplência</AlertTitle>
    <AlertDescription>
      Este caso foi suspenso em {format(new Date(serviceCase.suspended_at), "dd/MM/yyyy 'às' HH:mm")}.
      <br />
      <strong>Motivo:</strong> {serviceCase.suspension_reason}
      <br />
      <span className="text-sm">Aguarde a regularização financeira para continuar.</span>
    </AlertDescription>
  </Alert>
)}
```

### 4. Adicionar indicador visual no `CasesList.tsx`

**Badge "Suspenso" na listagem:**

```typescript
{serviceCase.is_suspended && (
  <Badge variant="destructive" className="ml-2">
    Suspenso
  </Badge>
)}
```

### 5. Adicionar indicador visual no `ContractsList.tsx`

**Badge "Suspenso" na listagem:**

```typescript
{contract.is_suspended && (
  <Badge variant="destructive">Suspenso</Badge>
)}
```

---

## Arquivos a Modificar/Criar

| Arquivo | Alteração |
|---------|-----------|
| **Migração SQL** | Adicionar campos `is_suspended`, `suspended_at`, `suspended_by`, `suspension_reason` em `contracts` e `service_cases` |
| `src/hooks/useContracts.ts` | Adicionar `suspendContract` e `reactivateContract` mutations |
| `src/pages/contracts/ContractDetail.tsx` | Adicionar botões, dialog e badge de suspensão |
| `src/pages/contracts/ContractsList.tsx` | Adicionar badge de suspenso na listagem |
| `src/pages/cases/CaseDetail.tsx` | Adicionar alerta de caso suspenso |
| `src/pages/cases/CasesList.tsx` | Adicionar badge de suspenso na listagem |

---

## Permissões

As políticas RLS existentes já permitem que FINANCEIRO e ADMIN modifiquem contratos. A mesma lógica se aplica aos novos campos.

---

## Testes Recomendados

1. Suspender um contrato ASSINADO e verificar que o caso técnico também foi suspenso
2. Verificar que o técnico recebe notificação de suspensão
3. Verificar badge "Suspenso" na lista de contratos
4. Verificar alerta na página de detalhes do caso
5. Reativar contrato e verificar que caso técnico também foi reativado
6. Verificar que o técnico recebe notificação de reativação
7. Verificar que badges/alertas são removidos após reativação

---

## Benefícios

- **Controle financeiro**: Financeiro pode pausar processos de clientes inadimplentes
- **Comunicação clara**: Técnico é notificado e vê alertas visuais claros
- **Rastreabilidade**: Registro de quem suspendeu, quando e por quê
- **Reversibilidade**: Fácil reativar quando cliente regulariza

