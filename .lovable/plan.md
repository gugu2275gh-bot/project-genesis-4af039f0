## Problema confirmado

Consultei o banco: **nenhuma das 20 etapas** do fluxo "Pré-Handsoff" tem o campo "Salvar resposta em" (`field_mapping`) preenchido — todas estão vazias.

Como o webhook só grava no CRM as respostas que têm `field_mapping` (`lib/visual-flow.ts` → `applyCapturedFields`), e a trava de fluxo desliga a extração legada (nome/e-mail/dados pessoais) enquanto o fluxo roda, hoje as respostas ficam **apenas** dentro de `lead_funnel_state.answers` (JSON) e nunca chegam a `contacts`, `leads` ou aos campos do funil. Era isso que acontecia antes do fluxo existir.

Objetivo: voltar a gravar tudo no lugar certo, **sem mudar nada no comportamento do fluxo** (mesmas perguntas, mesma ordem, mesmas mensagens, mesmas ramificações).

## O que será feito

### 1. Preencher o mapeamento das etapas atuais (dados, não código)
Preencher `field_mapping` nas etapas do fluxo Pré-Handsoff conforme o significado de cada pergunta:

| Etapa | Grava em |
|---|---|
| msg_3_coletar_nome_completo | `contact.full_name` (+ marca nome confirmado) |
| msg_4_coletar_e_mail | `contact.email` |
| msg_5_entender_interesse | `funnel.interest_confirmed` + interesse do lead |
| msg_7_perguntar_localizacao | `funnel.location_known` |
| msg_a2_perguntar_idade | idade (perfil fora da Espanha) |
| msg_a3 / a4 / a5 / a6 | Europa 6 meses / familiar UE / trabalho remoto / formação superior |
| msg_b2_data_de_entrada_na_espanha | data de chegada na Espanha (contato + funil) |
| msg_b3_esta_empadronado | empadronado sim/não |
| msg_b4_desde_quando | empadronado desde |
| msg_b5_cidade_do_empadronamento | cidade do empadronamento |
| msg_a1 / msg_b1 (cenário/situação) | situação declarada no funil |

Isso é uma atualização de dados: nada muda no fluxo, apenas passa a existir destino para cada resposta. Ficará visível/editável na tela da etapa.

### 2. Ampliar os destinos suportados
`applyCapturedFields` hoje cobre poucos campos. Serão adicionados destinos que existiam no fluxo antigo:
- `contact.spain_arrival_date`, `contact.is_empadronado`, `contact.empadronamiento_city`, `contact.empadronamiento_since`, `contact.education_level`, `contact.works_remotely`, `contact.has_eu_family_member`, `contact.birth_date`/idade
- `lead.interest` (interesse/serviço declarado)
- campos do funil equivalentes (`entry_date_confirmed`, `empadronado_*`, `outside_spain_progress`)

Regras de gravação: datas `DD/MM/YYYY` normalizadas para o formato do banco; Sim/Não convertidos para booleano; valores vazios ou inválidos são ignorados; erro em um campo não interrompe os demais nem o fluxo.

### 3. Inferência automática quando o mapeamento estiver vazio
Para fluxos novos ou etapas sem mapeamento configurado, o motor infere o destino pelo tipo de resposta e pelo código/nome da etapa (ex.: `EMAIL` → e-mail do contato, `NOME` → nome completo, etapa com "empadronado" → empadronamento). Se não houver correspondência segura, a resposta continua salva em `answers` como hoje — nunca grava dado adivinhado em campo errado.

### 4. Rede de segurança: extração passiva durante o fluxo
Reativar a extração de dados pessoais (`extractAndSuggestContactData`) em segundo plano durante o fluxo, em modo **somente sugestão/preenchimento de campo vazio**: nunca sobrescreve valor já confirmado e nunca interfere na próxima pergunta nem na resposta enviada (roda fora do caminho crítico, sem atrasar o atendimento).

### 5. Backfill dos atendimentos já feitos
Script para reprocessar `lead_funnel_state.answers` dos atendimentos recentes e gravar nos campos do CRM os dados que ficaram só no JSON (nome, e-mail, datas, empadronamento etc.), sem sobrescrever nada já preenchido.

## Verificação
- Testes Deno cobrindo: mapeamento explícito, inferência automática, normalização de datas DD/MM/YYYY, Sim/Não, e "não grava quando incerto".
- Rodar a suíte existente do fluxo para garantir que perguntas, ordem, ramificações e mensagens permanecem idênticas.
- Conferir no banco um atendimento de teste: contato e funil preenchidos ao final do fluxo.

## Detalhes técnicos
- `supabase/functions/whatsapp-webhook/lib/visual-flow.ts`: expandir `applyCapturedFields` (novos destinos, normalizadores de data/booleano) e adicionar inferência de destino.
- `supabase/functions/_shared/flow-engine.ts`: emitir `captured` também para etapas sem `field_mapping` explícito (com destino inferido), sem alterar transições.
- `supabase/functions/whatsapp-webhook/index.ts`: disparar a extração passiva em background dentro do bloco de fluxo.
- Atualização de dados em `ai_agent_flow_steps.field_mapping` e script de backfill sobre `lead_funnel_state`.
