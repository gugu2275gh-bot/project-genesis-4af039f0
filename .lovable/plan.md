## O que aconteceu (diagnóstico confirmado no código e no banco)

O cliente escreveu: *"tenho 34 anos, moro em Valencia, sou formado, minha avó é italiana, cheguei em maio, quero nacionalidade"*. O agente respondeu duas mensagens: uma saudação personalizada correta e, logo depois, a pergunta geral inteira de novo — inclusive com `{nome}` cru na tela.

Três causas independentes, todas verificadas:

**1. A etapa "Pergunta geral" nunca é marcada como respondida.**
O aproveitamento (`prefillFromFieldValues`) percorre as etapas e casa **um** campo por etapa (`field_mapping`). A etapa `abertura_geral` do fluxo "teste aberto" tem `field_mapping = null` (ela captura 8 campos via `general_capture`, não um só). Resultado: ela não entra no mapa de prefill, o motor começa no INÍCIO, chega nela como primeira pergunta pendente e a envia — mesmo com todos os dados já extraídos. As etapas seguintes até estavam prefilhadas, mas o fluxo parou antes de chegar nelas.

**2. `{nome}` não é substituído nas mensagens das etapas.**
A troca de `{nome}` / `{resumo}` só existe nos templates de saudação do intake (`renderIntakeGreeting`). O texto de uma etapa comum sai literal — por isso o `{nome}` apareceu no WhatsApp.

**3. Vocabulário de campos divergente entre extração e etapas.**
A extração emite `outside.eu_family` e `outside.europe_6m`; as etapas do fluxo (e o editor) usam `contact.has_eu_family_member` e `contact.eu_entry_last_6_months`. Esses dois campos nunca casariam nem depois de corrigir o item 1.

## O que vou fazer

**A. Pergunta geral passa a ser "satisfeita" pelo intake**
- Em `flow-intake.ts`: além do casamento 1-campo, tratar etapas `PERGUNTA_GERAL` — se o intake capturou pelo menos N dos campos configurados em `general_capture.fields` (padrão: 2, configurável na etapa), a etapa é marcada como respondida, com um resumo do que foi entendido como "resposta".
- Os campos capturados continuam sendo gravados no CRM normalmente (`captured`), como se o cliente tivesse respondido a etapa.

**B. Alias de campos (uma única tabela de equivalências)**
- Mapa bidirecional: `outside.eu_family` ↔ `contact.has_eu_family_member`, `outside.europe_6m` ↔ `contact.eu_entry_last_6_months`, `funnel.empadronado_city` ↔ `contact.empadronamiento_city`, `outside.age` ↔ `contact.age`, `funnel.interest_confirmed` ↔ `lead.service_interest`.
- O prefill consulta o alias antes de desistir, então tanto faz qual vocabulário o usuário escolher no editor.

**C. Substituição de variáveis em todas as falas do agente**
- Nova função aplicada a toda mensagem de saída (etapas, reperguntas, ack, encerramento): `{nome}`/`{name}`/`{nombre}`, `{cidade}`, `{objetivo}`, `{idade}`.
- Fonte: respostas já dadas no fluxo → campos aproveitados do intake → nome do perfil do WhatsApp.
- Se a variável ficar vazia, a frase é limpa sem deixar buraco (ex.: "Olá, {nome}!" → "Olá!"), nunca sai `{nome}` cru.

**D. Sem saudação duplicada**
- Quando a saudação personalizada do intake é enviada e a etapa geral foi satisfeita, a abertura da etapa é descartada (já existe `dropOpeningMessages`; passa a cobrir também a etapa geral satisfeita).

**E. Editor de fluxos (para você montar fluxos parecidos à mão)**
- Em `StepGeneralCaptureEditor`: campo "Considerar respondida quando o agente entender pelo menos **N** campos" e um resumo visual de quais campos essa etapa cobre e em qual campo do CRM cada um grava.
- Em `StepInspector`: painel de ajuda "Variáveis disponíveis" (`{nome}`, `{cidade}`, `{objetivo}`, `{idade}`) com clique para inserir no texto, válido em qualquer etapa.
- Aviso na etapa quando o texto usa uma variável que nenhuma etapa/intake anterior consegue preencher.

**F. Ajuste do fluxo "teste aberto"**
- Migração leve para completar a configuração da etapa `abertura_geral` (limiar de campos e alias de `city`), sem recriar o fluxo — você continua livre para editá-lo no editor.

## Validação
- Testes em `_shared/flow_intake_test.ts` e `whatsapp-webhook/flow_field_capture_test.ts` com exatamente a frase do print: deve pular a etapa geral, pular idade/cidade/formação/familiar/objetivo, e parar na primeira pergunta realmente pendente (e-mail), sem `{nome}` em nenhuma mensagem.
- Teste do caso oposto ("oi") — abertura normal, com `{nome}` resolvido pelo nome do WhatsApp.
- Deploy de `whatsapp-webhook` e `ai-agent-sandbox`, e conferência no sandbox do agente antes de você testar no WhatsApp.

## Detalhes técnicos
Arquivos: `supabase/functions/_shared/flow-intake.ts`, `flow-engine.ts` (prefill multi-campo, `generalCaptureOf`, interpolação), `flow-i18n.ts` (interpolar depois de traduzir), `whatsapp-webhook/lib/visual-flow.ts`, `ai-agent-sandbox/index.ts`, `src/components/ai-agents/flow-builder/StepGeneralCaptureEditor.tsx`, `StepInspector.tsx`, `src/types/ai-agent-flow-builder.ts`.
