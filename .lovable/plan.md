## Parte 1 — Morar fora da Espanha ≠ não estar na Espanha

Na conversa, o cliente disse "moro em Paris" e o agente respondeu "Vi que você ainda não está na Espanha." Isso é dedução indevida: o país de residência não diz onde a pessoa está fisicamente agora.

Pontos confirmados no código:
- `supabase/functions/_shared/flow-intake.ts:283` — `if (country && !out.in_spain) out.in_spain = isSpain(country) ? 'sim' : 'nao'`, que vira `funnel.location_known` e entra no resumo `buildIntakeSummary` (linhas 404-419).
- `supabase/functions/whatsapp-webhook/lib/visual-flow.ts:436-441` — ao gravar `contact.residence_country`, escreve `contacts.is_in_spain` e `funnel.location_known` só pelo nome do país.

Mudanças:
1. `flow-intake.ts`: remover a inferência de `in_spain` a partir de `residence_country`. Só existe quando o cliente afirma explicitamente ("já estou na Espanha", "ainda não cheguei") ou quando a etapa pergunta isso.
2. `buildIntakeSummary`: a frase "Vi que você (já/ainda não) está na Espanha" só sai com afirmação explícita. Sem isso, o resumo cita apenas o que foi dito (país/objetivo), nos 4 idiomas.
3. `visual-flow.ts`: no case `contact.residence_country`, gravar apenas `contacts.residence_country`; não tocar em `is_in_spain` nem em `funnel.location_known`. O case `funnel.location_known` (sim/não explícito) continua igual.
4. Se o fluxo marcar `in_spain` como obrigatório, ele volta a ser perguntado normalmente, com o prompt já existente em `flow-required.ts`.

## Parte 2 — Mensagem inicial enxuta: remover da lista o que já foi informado

Hoje, mesmo quando a primeira mensagem já traz dados, a abertura sai com a lista completa ("idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses").

Comportamento novo:
- Antes de enviar a abertura da etapa `PERGUNTA_GERAL`, o motor já processa a mensagem inicial (intake) e conhece os campos preenchidos.
- A lista entre parênteses do texto da etapa passa a ser **gerada dinamicamente** a partir dos campos obrigatórios/configurados que ainda estão vazios, em vez de ser texto fixo.
- Exemplo: usuário escreve "Meu nome é Roberto, tenho 50 anos e tenho tio na Europa e moro no Brasil" → nome, idade, familiar europeu e país já reconhecidos → sai:
  "Olá, Roberto! Eu sou a assistente virtual da CB ASESORIA. 😊 Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (possui formação superior, esteve na Europa nos últimos 6 meses)."
- Se todos os campos da lista já vierem preenchidos, a lista some da frase (fica só a saudação) e o fluxo avança direto para a próxima etapa (objetivo).
- Depois dessa mensagem, a coleta dos campos faltantes segue a regra atual: um campo por vez, sem repetir o que já foi informado, nome com prioridade quando ausente.

Implementação:
- Nova função em `_shared/flow-intake.ts` (ou `flow-required.ts`) que monta a lista de rótulos dos campos pendentes nos 4 idiomas (PT/ES/EN/FR), reutilizando os rótulos já existentes de cada campo.
- A abertura da etapa passa a suportar um marcador de lista dinâmica; quando o texto da etapa contiver a lista entre parênteses, ela é substituída pelos pendentes (e removida se não houver nenhum).
- Atualizar o texto da etapa `dados_pessoais` do fluxo "Pre-Hands off G" via SQL para usar esse marcador, mantendo as traduções.
- Aplicar tanto na produção (`whatsapp-webhook`) quanto no sandbox (`ai-agent-sandbox`), já que ambos usam o mesmo motor.

## Testes

`_shared/flow_intake_test.ts` e `_shared/flow_required_gate_test.ts`: país fora da Espanha não define `in_spain`; afirmação explícita continua definindo; resumo não afirma localização sem dado explícito; abertura com lista reduzida quando há dados na 1ª mensagem; abertura sem lista quando tudo já foi informado. Rodar toda a suíte de edge functions.
