## O que eu verifiquei no banco e nos logs

Atendimento do contato "WhatsApp 0909" (`553195720909`), 26/07 22:51:

- 1ª mensagem do cliente: **"Oi. Sou Roberto. Estou na Espanha tem 30 dias e vim estudar"**
- Respostas enviadas: abertura padrão + "Antes de tudo, como é seu nome completo?" — ou seja, **nenhum dado foi aproveitado e a saudação personalizada não foi usada**.
- Estado gravado no funil: `visual_flow_state.answers = {}` e `visited = [inicio, msg_1_2_abertura, msg_3_nome]` → o motor **não recebeu nenhum prefill**.
- O fluxo "Pré-Handsoff" tem `intake_config.enabled = true`, `min_confidence 0.7` e os campos marcados (nome, e-mail, localização, intenção, datas, empadronamento).
- As etapas têm `field_mapping` corretos (`contact.full_name`, `funnel.interest_confirmed`, `funnel.location_known`, `funnel.entry_date_confirmed`…), então o casamento etapa↔campo deveria funcionar.
- Nos logs do `whatsapp-webhook` aparece `[VISUAL_FLOW]` do turno, mas **nenhum log `[VISUAL_FLOW][INTAKE]` e nenhum aviso de falha**.

**Diagnóstico ainda não confirmado.** Hoje o código tem três caminhos que produzem exatamente esse resultado **sem deixar rastro nenhum no log**:

1. `runIntake` engole erro do LLM (`catch { return empty }`) — uma resposta 429/500 do Gemini free tier some silenciosamente;
2. o LLM responde algo sem JSON válido → retorna vazio, sem log;
3. a configuração da aba "Primeira mensagem" pode ter vindo do cache de 60 s ainda desligada (ela foi salva 21 s antes da conversa).

Como só um dos três explica o caso, o primeiro passo do plano é tornar isso observável e reproduzir; as correções cobrem os três.

## Plano

### 1. Observabilidade do intake (primeiro passo, obrigatório)
Fazer `runIntake` devolver um motivo (`reason`) em vez de vazio mudo: `disabled`, `no_llm`, `llm_error:<status>`, `parse_error`, `low_confidence`, `no_match`, `ok`. Registrar sempre uma linha `[VISUAL_FLOW][INTAKE]` no webhook e no sandbox, com motivo, campos extraídos e etapas aproveitadas. Sem isso não há como afirmar a causa raiz.

### 2. Chamada do LLM de intake resiliente
Hoje o intake chama `gemini-2.5-flash-lite` fixo e direto. Passar a usar a mesma cascata de modelos do agente, com fallback para o Lovable AI Gateway, e uma nova tentativa em caso de 429/5xx. Assim uma limitação de cota deixa de derrubar o aproveitamento em silêncio.

### 3. Cache da configuração
Invalidar o cache de `intake_config`/etapas quando o fluxo é salvo (chave de cache com o `updated_at` do fluxo), para que uma alteração na aba "Primeira mensagem" valha no atendimento seguinte, não até 60 s depois.

### 4. Nome parcial e saudação
Com "Sou Roberto", o motor descarta o nome (a etapa exige nome completo) e hoje isso também derruba a saudação personalizada. Passar a guardar o primeiro nome como dado de saudação mesmo quando a etapa de nome completo continua pendente: a resposta vira "Olá, Roberto! … Vi que você já está na Espanha e que seu objetivo é estudar. Antes de seguir, me confirma seu nome completo?".

### 5. Evitar saudação duplicada
Quando a saudação do intake for usada, suprimir a etapa informativa de abertura (Msg 1-2), para não mandar duas saudações seguidas.

### 6. Validação
Teste com a frase exata do Roberto no sandbox e testes automatizados em `flow_intake_test.ts` cobrindo: motivo registrado em cada caminho de falha, fallback de modelo, nome parcial + saudação, e ausência de abertura duplicada. Depois reenviar o caso pelo WhatsApp e conferir o log `[VISUAL_FLOW][INTAKE]`.

## Detalhes técnicos

- `supabase/functions/_shared/flow-intake.ts`: `IntakeResult.reason`, primeiro nome preservado, `renderIntakeGreeting` aceitando nome parcial.
- `supabase/functions/whatsapp-webhook/lib/visual-flow.ts`: log do motivo, supressão da etapa de abertura quando há saudação de intake, chave de cache versionada por `updated_at`.
- `supabase/functions/whatsapp-webhook/index.ts` e `ai-agent-sandbox/index.ts`: `intakeLLM` usando cascata + Lovable AI Gateway com retry.
- Sem mudanças de banco de dados.
