

## Corrigir Erro de Enum ao Alterar Serviço de Interesse no Lead

### Problema
O `ServiceTypeCombobox` retorna códigos do catálogo dinâmico (ex: `RESIDENCIA_MENOR_NO_NACIDO_ES`), mas a coluna `leads.service_interest` é um enum do banco com apenas 8 valores fixos. Ao salvar, o Supabase rejeita valores que não estão no enum.

### Solução
Ao salvar o serviço de interesse no `handleSaveContact` do `LeadDetail.tsx`:

1. Verificar se o valor selecionado é um dos valores válidos do enum `service_interest`
2. Se for válido, salvar diretamente em `service_interest`
3. Se **não** for válido (veio do catálogo dinâmico), salvar `service_interest` como `'OUTRO'` e salvar o `service_type_id` correspondente no lead

Isso segue o mesmo padrão já usado em `ContactDetail.tsx` e `Leads.tsx`, que salvam o `service_type_id` junto com o `service_interest`.

### Arquivo modificado
- `src/pages/crm/LeadDetail.tsx` — Ajustar `handleSaveContact` para mapear o valor do combobox para o enum correto + `service_type_id`

### Detalhe técnico
```text
const VALID_SERVICE_INTERESTS = [
  'VISTO_ESTUDANTE', 'VISTO_TRABALHO', 'REAGRUPAMENTO',
  'RENOVACAO_RESIDENCIA', 'NACIONALIDADE_RESIDENCIA',
  'NACIONALIDADE_CASAMENTO', 'OUTRO', 'RESIDENCIA_PARENTE_COMUNITARIO'
];

// No handleSaveContact:
const selectedST = serviceTypes?.find(st => st.code === editForm.service_interest);
const isValidEnum = VALID_SERVICE_INTERESTS.includes(editForm.service_interest);

await updateLead.mutateAsync({
  id: lead.id,
  service_interest: isValidEnum ? editForm.service_interest : 'OUTRO',
  service_type_id: selectedST?.id || null,
});
```

