## Mapeamento dos campos da ficha de cliente

Levantamento realizado nas tabelas `public.contacts` e `public.leads` e confirmado no código de persistência do fluxo (`supabase/functions/whatsapp-webhook/lib/visual-flow.ts` e `supabase/functions/_shared/flow-intake.ts`).

| Item da ficha | Tabela | Campo real no banco | Tipo / Valores | Observação sobre o fluxo |
|---|---|---|---|---|
| **Nome** | `contacts` | `full_name` | `text` | No fluxo é referenciado como `contact.full_name`. |
| **Idade** | `contacts` | `birth_date` (derivado) | `date` | No fluxo é capturado como `outside.age` (idade em anos); ao salvar é convertido em `birth_date` com ano aproximado (`YYYY-01-01`). Não existe uma coluna `age` na tabela. |
| **Onde você mora** | `contacts` | `residence_country` | `text` | No fluxo também aparece como `contact.residence_country` / `outside.residence_country`. Alimenta indiretamente `contacts.is_in_spain`. |
| **Possui formação superior?** | `contacts` | `education_level` | `text` | Valores esperados: `SUPERIOR`, `NAO_SUPERIOR`, `FUNDAMENTAL`, `MEDIO`. No fluxo: `contact.education_level`. |
| **Possui algum familiar europeu?** | `contacts` | `has_eu_family_member` | `boolean` | No fluxo: `contact.has_eu_family_member` / `outside.eu_family`. |
| **Esteve na Europa nos últimos 6 meses?** | `contacts` | `eu_entry_last_6_months` | `boolean` | No fluxo: `contact.eu_entry_last_6_months` / `outside.europe_6m`. |
| **Serviço** | `leads` | `service_interest` | `enum` (`service_interest`) | Valores possíveis: `VISTO_ESTUDANTE`, `VISTO_TRABALHO`, `REAGRUPAMENTO`, `RENOVACAO_RESIDENCIA`, `NACIONALIDADE_RESIDENCIA`, `NACIONALIDADE_CASAMENTO`, `OUTRO`. No fluxo: `lead.service_interest` / `funnel.interest_confirmed`. Também atualiza `leads.interest_confirmed = true`. |

### Detalhes importantes
- **Idade**: a conversação captura a idade em anos (`outside.age`), mas o CRM armazena data de nascimento. A persistência faz a conversão `idade → ano de nascimento aproximado` e grava em `contacts.birth_date`.
- **Serviço**: o texto livre da intenção (`funnel.interest_confirmed`) é normalizado para um dos valores do enum `service_interest` e salvo em `leads.service_interest`.
- **Campos `outside.*`**: não são tabelas separadas; são prefixos usados internamente pelo fluxo para dados ainda não mapeados ao CRM. Os valores são convertidos para colunas reais de `contacts` ou `leads` na hora de salvar.

Nenhuma alteração de código é necessária — este é apenas um levantamento de mapeamento.