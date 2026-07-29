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
