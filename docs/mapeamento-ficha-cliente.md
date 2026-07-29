# Mapeamento Ficha de Cliente ↔ Banco de Dados

Este documento descreve o mapeamento entre os itens coletados na ficha de cliente do fluxo conversacional e os respectivos campos e tabelas do banco de dados Supabase.

## Tabela de Mapeamento

| Item da ficha | Tabela | Campo real no banco | Observações |
|---|---|---|---|
| **Nome** | `contacts` | `full_name` | Equivalente ao prefixo `contact.full_name` no fluxo. |
| **Idade** | `contacts` | `birth_date` | Capturado como `outside.age` no fluxo; convertido para ano aproximado (`YYYY-01-01`) ao persistir. |
| **Onde você mora** | `contacts` | `residence_country` | Também alimenta a flag `is_in_spain` quando aplicável. |
| **Formação superior** | `contacts` | `education_level` | Valores esperados: `SUPERIOR`, `NAO_SUPERIOR`, etc. |
| **Familiar europeu** | `contacts` | `has_eu_family_member` | Mapeado a partir de `outside.eu_family`. |
| **Esteve na Europa nos últimos 6 meses** | `contacts` | `eu_entry_last_6_months` | Mapeado a partir de `outside.europe_6m`. |
| **Serviço** | `leads` | `service_interest` | Normalizado a partir do texto livre da intenção (ex.: "morar/viver na Espanha" → serviço de residência). |

## Notas gerais

- Os campos `outside.*` são prefixos utilizados internamente pelo fluxo para identificar dados capturados pela conversa antes de persistir no CRM.
- A conversão de idade para `birth_date` utiliza o ano aproximado informado pelo cliente, fixado no dia `01-01` por falta de data exata de nascimento.
- O campo `service_interest` é um enum (`service_interest`) e a normalização da intenção é feita pelo mecanismo de intake do fluxo.

## Referências

- `supabase/functions/whatsapp-webhook/lib/visual-flow.ts` — aplicação dos campos capturados no CRM.
- `supabase/functions/_shared/flow-intake.ts` — extração de entidades a partir da mensagem do usuário.
- `supabase/functions/_shared/flow-vars.ts` — mapeamento de variáveis e alias de campos.

---

## Tabelas de serviço

| Tabela | Papel |
|---|---|
| `service_types` | **Catálogo** de tipos de serviço. É aqui que ficam `name` (nome), `description` (descrição) e `is_active` (ativo). Campos: `id`, `code`, `name`, `description`, `sector_id`, `is_active`, `display_order`, `created_at`, `updated_at`. |
| `service_sectors` | Setores operacionais (`id`, `code`, `name`, `description`, `is_active`, `display_order`). |
| `service_cases` | **Serviço efetivamente prestado** (o processo/caso do cliente). Não possui nome, descrição nem indicador de ativo. |

> Atenção: `service_cases` **não tem** os campos "nome do serviço", "descrição" ou "ativo". Esses atributos pertencem ao catálogo `service_types`. Em `service_cases` o serviço é indicado apenas pelo enum `service_type`.

## Campos de `service_cases`

| Grupo | Campos |
|---|---|
| Identificador | `id` (uuid, PK) |
| Vínculos | `opportunity_id`, `client_user_id`, `assigned_to_user_id`, `previous_case_id` |
| Serviço | `service_type` (enum `service_interest`), `sector` (enum `service_sector`) |
| Situação | `technical_status`, `decision_result`, `decision_date`, `closed_at`, `closure_reason`, `approval_date` |
| Processo | `protocol_number`, `expediente_number`, `submission_date`, `expected_protocol_date`, `documents_completed_at`, `technical_approved_at`, `sent_to_legal_at`, `requirement_received_at`, `requirement_deadline`, `protocol_instructions_sent`, `protocol_receipt_url`, `protocol_receipt_approved`, `protocol_receipt_approved_by`, `protocol_receipt_approved_at`, `first_contact_at` |
| Huellas / TIE | `huellas_date`, `huellas_time`, `huellas_location`, `huellas_completed`, `huellas_resguardo_url`, `tie_lot_number`, `tie_validity_date`, `tie_pickup_date`, `tie_picked_up`, `tie_resguardo_url`, `residencia_validity_date` |
| Jurídico / recurso | `juridical_review_status`, `juridical_notes`, `resource_status`, `resource_deadline`, `resource_notes` |
| Prioridade | `is_urgent`, `case_priority` |
| Auditoria | `created_at`, `updated_at` |

## Ligação entre lead e serviço prestado

Não existe `service_case_id` em `leads`. A ligação é **indireta**, através de `opportunities`:

```text
leads.id
   -> opportunities.lead_id
        opportunities.id
             -> service_cases.opportunity_id
```

Campos de serviço em `leads`:

| Campo | Tipo | Uso |
|---|---|---|
| `service_interest` | enum `service_interest` | Intenção de serviço capturada no fluxo conversacional. |
| `service_type_id` | uuid | Referência ao catálogo `service_types`. |

Existe ainda a relação M2M `contract_leads` (contratos ↔ serviços/leads), usada na geração de contratos, mas ela não liga leads a `service_cases`.
