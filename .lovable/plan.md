

## Serviço Futuro (Standby) — Plano de Implementação

### Problema
Clientes que agendam um serviço para o futuro precisam que esse serviço fique "congelado" — sem entrar em nenhum grupo de contrato nem gerar pagamentos — até que seja manualmente ativado.

### Solução Proposta
Aproveitar o status `STANDBY` que já existe no enum `lead_status` e adicionar controles visuais e lógicos em três pontos:

---

### 1. Botão "Serviço Futuro" no Detalhe do Lead (`LeadDetail.tsx`)
- Adicionar um botão visível quando o lead está em `NOVO`, `DADOS_INCOMPLETOS` ou `INTERESSE_PENDENTE`
- Ao clicar, muda o status para `STANDBY`
- O lead exibe o banner amarelo já existente ("Standby — Prazos pausados")
- Adicionar um botão "Ativar Serviço" quando o lead está em `STANDBY`, que retorna o status para `INTERESSE_PENDENTE` (ou abre o fluxo de confirmação de interesse)

### 2. Bloquear leads STANDBY no Grupo de Serviços (`ContractGroupsSection.tsx`)
- Filtrar leads com status `STANDBY` para que **não apareçam** na lista de serviços disponíveis para agrupamento em contratos
- Exibir os leads em standby em uma seção separada com visual diferenciado (fundo amarelo/âmbar), com badge "Serviço Futuro"
- Cada item standby terá um botão "Ativar" que muda o status e o torna elegível para contratos

### 3. Opção ao Criar Serviço na Ficha do Cliente (`ContactDetail.tsx`)
- No diálogo de "Adicionar Serviço", adicionar um checkbox "Serviço Futuro (Standby)" 
- Se marcado, o lead é criado já com status `STANDBY` em vez de `NOVO`

---

### Arquivos a Editar

| Arquivo | Alteração |
|---|---|
| `src/pages/crm/LeadDetail.tsx` | Botão "Marcar como Serviço Futuro" e "Ativar Serviço" |
| `src/components/crm/ContractGroupsSection.tsx` | Filtrar standby dos ungrouped, seção separada com botão ativar |
| `src/pages/crm/ContactDetail.tsx` | Checkbox "Serviço Futuro" no diálogo de novo serviço |

### Fluxo Resumido

```text
Criar Serviço ──► [Serviço Futuro?]
                     │ Sim → Lead criado com status STANDBY
                     │        (não aparece para contratos)
                     │        ↓
                     │     Botão "Ativar" → status INTERESSE_PENDENTE
                     │        ↓
                     │     Segue fluxo normal
                     │
                     │ Não → Lead criado com status NOVO
                     │        (fluxo normal)
```

Nenhuma migração de banco de dados é necessária — o status `STANDBY` já existe no enum.

