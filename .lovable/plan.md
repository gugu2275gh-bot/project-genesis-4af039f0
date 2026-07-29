Gerar o arquivo de documentação `docs/mapeamento-ficha-cliente.md` contendo a tabela de mapeamento entre os itens da ficha de cliente (nome, idade, onde você mora, formação superior, familiar europeu, esteve na Europa nos últimos 6 meses, serviço) e os respectivos campos/tabelas no banco de dados Supabase, conforme levantamento já validado.

## Detalhes técnicos

O conteúdo do arquivo será uma tabela markdown com as seguintes colunas:

- **Item da ficha**: nome amigável apresentado ao usuário no fluxo.
- **Tabela**: tabela do Supabase onde o dado é persistido (`contacts` ou `leads`).
- **Campo real no banco**: coluna exata no schema.
- **Observação**: notas importantes sobre conversões, equivalências ou mapeamentos de fluxo.

Linhas a incluir:

| Item | Tabela | Campo | Observação |
|---|---|---|---|
| Nome | `contacts` | `full_name` | Equivalente a `contact.full_name` no fluxo. |
| Idade | `contacts` | `birth_date` | Capturado como `outside.age` no fluxo; convertido para ano aproximado (`YYYY-01-01`) ao salvar. |
| Onde você mora | `contacts` | `residence_country` | Mapeado do fluxo; também alimenta `is_in_spain`. |
| Formação superior | `contacts` | `education_level` | Valores esperados: `SUPERIOR`, `NAO_SUPERIOR`, etc. |
| Familiar europeu | `contacts` | `has_eu_family_member` | Mapeado de `outside.eu_family`. |
| Esteve na Europa nos últimos 6 meses | `contacts` | `eu_entry_last_6_months` | Mapeado de `outside.europe_6m`. |
| Serviço | `leads` | `service_interest` | Normalizado a partir do texto livre da intenção ("morar/viver na Espanha" → residência). |

O arquivo será salvo em `docs/mapeamento-ficha-cliente.md` e um `<presentation-artifact>` será emitido para visualização/download.