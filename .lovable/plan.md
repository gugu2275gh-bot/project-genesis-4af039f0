Ampliar o documento `docs/mapeamento-ficha-cliente.md` com a parte de serviços, com base no que foi verificado no schema.

## Respostas verificadas (que irão para o documento)

**`service_cases` — não tem "nome do serviço", "descrição" nem "ativo".** É a tabela do processo executado, não um catálogo. Campos principais:
- Identificador: `id` (uuid)
- Vínculo: `opportunity_id`, `client_user_id`, `assigned_to_user_id`, `previous_case_id`
- Serviço: `service_type` (enum `service_interest`), `sector` (enum `service_sector`)
- Situação: `technical_status`, `decision_result`, `decision_date`, `closed_at`, `closure_reason`
- Processo: `protocol_number`, `expediente_number`, `submission_date`, `expected_protocol_date`, `documents_completed_at`, `requirement_deadline`
- Huellas/TIE: `huellas_date/time/location/completed`, `tie_lot_number`, `tie_validity_date`, `tie_pickup_date`, `tie_picked_up`
- Jurídico/recurso: `juridical_review_status`, `juridical_notes`, `resource_status`, `resource_deadline`
- Prioridade: `is_urgent`, `case_priority`

O catálogo com **nome, descrição e ativo** é `service_types`: `id`, `code`, `name`, `description`, `sector_id`, `is_active`, `display_order`.

**Ligação leads ↔ service_cases:** não existe `service_case_id` em `leads`. O caminho é indireto:

```text
leads.id  ->  opportunities.lead_id
opportunities.id  ->  service_cases.opportunity_id
```

Em `leads` os campos de serviço são `service_interest` (enum, intenção capturada no fluxo) e `service_type_id` (FK para `service_types`).

## Alterações no arquivo

Acrescentar ao final de `docs/mapeamento-ficha-cliente.md`:
1. Seção "Tabelas de serviço" com as três tabelas (`service_types`, `service_sectors`, `service_cases`) e seus papéis.
2. Tabela de campos de `service_cases` agrupada por finalidade.
3. Seção "Ligação entre lead e serviço prestado" com o diagrama ASCII do caminho `leads → opportunities → service_cases` e a nota de que não há FK direta.
4. Nota sobre onde ficam nome/descrição/ativo (em `service_types`, não em `service_cases`).

Nenhuma alteração de código ou de banco — apenas documentação.
