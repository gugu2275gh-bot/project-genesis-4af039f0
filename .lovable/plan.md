# Corrigir fluxo do funil sendo pulado em PT-BR (caso Gustavo)

## O que aconteceu (diagnóstico)

Lead `8cff3b45-f198-4677-a832-6a7809375ffb` (Gustavo Braga / 553186200110). Contato e lead foram criados ~1 segundo antes do primeiro inbound `"oi"`. Mesmo assim, o bot pulou TODO o funil e devolveu, **no primeiro turno**, a sequência de pré-handoff + handoff + opener tudo junto:

```
19:03:40  → "Perfeito. Já consigo ter uma visão inicial do seu caso."          (H1 pré-handoff)
19:03:40  → "Na CB analisamos cada caso de forma individual..."                (H2 pré-handoff)
19:03:42  → "Olá 😊 Tudo bem?... Vou encaminhar suas informações..."           (abertura + H3 misturados)
```

Depois disso o bot ficou em modo "tira-dúvidas livre" e só perguntou o nome quando o cliente reclamou ("mas eu nem me apresentei").

Logs de telemetria `[TURN]` em todos os turnos posteriores mostram:
```
stepsDone: ["abertura","nome","email","interesse","localizacao","aprofundamento","preHandoff"]
dataKnown: { name:false, email:false, service:false }
gateActive: false
```

Estado salvo em `lead_funnel_state`:
```
step:               interesse
pre_handoff_sent:   true
handoff_sent:       true
name_confirmed:     true (somente depois que cliente reclamou)
email_confirmed:    true
interest_confirmed: null
location_known:     null
```

### Causa raiz

1. **`index.ts:1853-1869` marca TODAS as etapas como `done` quando detecta as frases de pré-handoff/handoff no histórico — sem checar se nome/email/interesse foram realmente capturados.**
   ```ts
   const preHandoffDoneByRegex = sentAny(/vis[ãa]o inicial.../i) && sentAny(/cada caso de forma individual.../i)
   const handoffDoneByRegex    = sentAny(/encaminhar suas informa[çc][õo]es.../i) && sentAny(/encaminhar para um atendente.../i)
   if (preHandoffDone && handoffDone) {
     for (const s of steps) s.done = true   // ← marca abertura/nome/email/interesse/localização todos como done
     ... step = 'livre' ...
   }
   ```
   Como Gemini, no primeiro turno, produziu essas frases (gate falhou em forçar `abertura`), o sistema concluiu o funil inteiro e travou em modo livre.

2. **Gate não bloqueou a saída do LLM quando ele produziu pré-handoff sem dados.** Não existe um "lock anti-handoff" enquanto `name_confirmed`/`email_confirmed`/`interest_confirmed` estiverem nulos. A instrução está só no prompt, mas Gemini pode ignorar.

3. **Idempotência do opener falha:** o opener canônico contém só duas frases; mas Gemini retornou as frases de H1/H2/H3 misturadas com o opener — e nenhum sanitizer detectou que esse output estava fora de ordem em um lead novo.

## Mudanças

### 1. `supabase/functions/whatsapp-webhook/index.ts` — bloquear conclusão do funil sem dados

Substituir o bloco "se preHandoff+handoff feitos → marca tudo done" por uma checagem que exija os dados confirmados:

```ts
const hasMinimumData =
  !!funnelStateLive.name_confirmed &&
  !!funnelStateLive.email_confirmed &&
  !!funnelStateLive.interest_confirmed &&
  funnelStateLive.location_known !== null
if (preHandoffDone && handoffDone && hasMinimumData) {
  for (const s of steps) s.done = true
  // ... step = 'livre' ...
} else if ((preHandoffDone || handoffDone) && !hasMinimumData) {
  // ALERTA: handoff disparado sem dados — não marca etapas como done,
  // mantém gate ativo, loga incidente para auditoria.
  console.warn('[FUNNEL] handoff_anchor_without_data', { leadId: lead.id, dataKnown: { ... } })
}
```

### 2. `supabase/functions/whatsapp-webhook/lib/overrides.ts` — sanitizer anti-handoff prematuro

Antes do envio (na pipeline que já tem `removeRepeatedQuestionIntro`, `stripLockedSentinel`, dedup), adicionar um filtro:

- Se `!hasMinimumData` (mesma definição), **remover** das frases de saída qualquer ocorrência de:
  - "visão inicial do seu caso" / "visión inicial de tu caso" / "initial view of your case"
  - "Na CB analisamos cada caso..." / equivalentes ES/EN/FR
  - "encaminhar suas informações" / "remitir tu información" / equivalentes
  - "encaminhar para um atendente" / "derivar a un agente" / equivalentes
- Se após o strip a resposta ficar vazia, substituir pela próxima pergunta canônica do funil (`abertura` ou `nome` etc., calculada pelo dispatch).

### 3. `supabase/functions/whatsapp-webhook/index.ts` — forçar `abertura` em primeira interação

Quando `funnelStateLive.step` for null/inicial **e** não houver histórico assistant (ou histórico só com opener_sent=false), o gate deve setar `nextStep = 'abertura'` e usar o output canônico da abertura, ignorando completamente o que o LLM gerou nesse turno. Esse caminho deve ser determinístico (mesmo padrão do `getScriptedNextStep` já usado em outras etapas).

### 4. `supabase/functions/whatsapp-webhook/lib/funnel-state.ts` — corrigir flags `pre_handoff_sent`/`handoff_sent`

Hoje essas flags são setadas via regex `preHandoffSummarySent(sentJoined)` em qualquer turno (index.ts:2528). Adicionar a mesma guarda `hasMinimumData` antes de persistir essas flags — assim, mesmo se Gemini produzir as frases prematuramente, o estado não fica contaminado.

### 5. Testes Deno
Criar `supabase/functions/whatsapp-webhook/handoff_guard_test.ts` cobrindo:
- Primeira interação ("oi" em pt-BR) num lead novo → resposta canônica de abertura, sem qualquer frase de handoff.
- LLM "vaza" frase de pré-handoff antes do nome ser capturado → sanitizer remove e devolve pergunta do nome.
- `pre_handoff_sent` NÃO é setado quando `name/email/interest/location` ainda estão nulos.
- Quando todos os dados estão capturados, pré-handoff e handoff funcionam normalmente (regressão).

### 6. Backfill — reset do lead do Gustavo
Resetar `lead_funnel_state` do lead `8cff3b45-f198-4677-a832-6a7809375ffb`:

```sql
UPDATE public.lead_funnel_state
SET step='abertura',
    pre_handoff_sent=false,
    handoff_sent=false,
    interest_confirmed=null,
    location_known=null,
    outside_spain_progress='{}'::jsonb,
    updated_at=now()
WHERE lead_id='8cff3b45-f198-4677-a832-6a7809375ffb';
```

Para que, quando o Gustavo responder de novo, o funil retome corretamente a partir da pergunta de interesse/localização (nome e email já foram coletados de verdade).

### 7. Deploy
Redeploy `whatsapp-webhook` após testes verdes.

## Fora de escopo
- Não mexer no prompt da IA (já instruído corretamente). A correção é defensiva no código.
- Não alterar tradução nem catálogo de serviços.
- Não tocar no fluxo do Roberto / data de entrada (corrigido no turno anterior).

## Validação
- Rodar `handoff_guard_test.ts` no Deno test runner.
- Simular um novo lead pt-BR enviando `"oi"` e conferir nos logs que `stepsDone=["abertura"]` (não a sequência inteira) e que apenas a abertura é enviada.
- Conferir no DB que `pre_handoff_sent` permanece `false` até que `name/email/interest/location` estejam preenchidos.
