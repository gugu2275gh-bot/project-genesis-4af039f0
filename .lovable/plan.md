## Objetivo

Permitir que **cada etapa** do fluxo visual tenha sua própria regra de "e se o cliente não souber / não lembrar / não quiser responder", sem mudar a ordem nem a estrutura do fluxo. A etapa continua sendo a mesma e o próximo passo continua o mesmo — muda só o comportamento do agente naquele momento.

Exemplo: "data de entrada no país" → cliente responde "não lembro" → agente responde "sem problema, uma data aproximada já ajuda: mês e ano servem" → se ainda assim não souber, grava "não informado" e segue para a próxima etapa normalmente.

## Nova aba no inspetor da etapa: "Se não souber responder"

Configuração por etapa, com estes campos:

1. **Comportamento** (escolha única):
   - `INSISTIR` — repergunta com a mensagem de insistência configurada (padrão hoje).
   - `ACEITAR_APROXIMADO` — insiste uma vez pedindo valor aproximado; se o cliente confirmar que não sabe, aceita o que ele deu (ou grava "aproximado/não informado") e segue.
   - `PULAR` — aceita "não sei" na hora, grava o valor de fallback e segue direto para a próxima etapa.
   - `ENCAMINHAR` — segue para a etapa de fallback já existente (comportamento atual de `fallback_step_code`).

2. **Mensagem de acolhimento** (multi-idioma, via `MultiLangField`, com tradução automática igual às demais mensagens) — ex.: "Sem problema! Uma data aproximada já me ajuda — só o mês e o ano servem."

3. **Tentativas antes de aplicar o comportamento** (número, padrão 1) — quantas vezes o agente pede o valor aproximado antes de aceitar/pular.

4. **Valor gravado quando pular** (texto, padrão vazio) — ex.: `NÃO INFORMADO` / `APROXIMADO`. É o que vai para `answers` e para o campo do CRM em "Salvar resposta em".

5. **Frases que indicam "não sei"** (lista editável, com padrões já preenchidos por idioma: não sei, não lembro, no sé, no recuerdo, I don't know, I don't remember, je ne sais pas…). Detecção também via IA quando a frase não bater com a lista.

Tudo isso é gravado dentro da coluna `validation` (jsonb) da etapa, em uma chave `unknown_answer`, sem migração de banco e sem afetar etapas existentes (ausência da chave = comportamento atual `INSISTIR`).

## Comportamento em execução (runtime)

No motor de fluxo, antes da validação normal da resposta:

```text
resposta do cliente
   ├─ é "não sei"?  ──não──> validação normal (igual hoje)
   └─ sim
        ├─ tentativas < limite  -> envia "mensagem de acolhimento", continua na MESMA etapa
        └─ tentativas esgotadas -> aplica o comportamento configurado:
               INSISTIR            -> repergunta padrão (como hoje)
               ACEITAR_APROXIMADO  -> grava a resposta dada / valor de fallback e AVANÇA
               PULAR               -> grava valor de fallback e AVANÇA
               ENCAMINHAR          -> vai para a etapa de fallback já configurada
```

Pontos garantidos:
- A **sequência do fluxo não muda**: em `ACEITAR_APROXIMADO` e `PULAR` o agente vai para o mesmo `next_step_code` / ramificação padrão que iria normalmente.
- Ramificações (Sim/Não) continuam funcionando; "não sei" só é tratado quando nenhuma ramificação casar.
- Datas continuam validadas em `DD/MM/YYYY`; o modo aproximado aceita "mês/ano" e normaliza para `01/MM/AAAA`, marcando o valor como aproximado.
- O valor de fallback é gravado no CRM pelo mesmo caminho de hoje (`field_mapping` / `applyCapturedFields`), então o cadastro reflete "não informado" em vez de ficar vazio sem explicação.

## Detalhes técnicos

- `src/types/ai-agent-flow-builder.ts`: novo tipo `UnknownAnswerConfig` (`mode`, `messages`, `attempts`, `fallback_value`, `phrases`) dentro de `StepValidation`, com defaults e normalização retrocompatível.
- Novo componente `src/components/ai-agents/flow-builder/StepUnknownAnswerEditor.tsx`, montado como 5ª aba do `StepInspector.tsx` ("Se não souber").
- `supabase/functions/_shared/flow-engine.ts`: função `detectUnknownAnswer(step, message, lang)` e tratamento do bloco acima em `advanceFlow`, com contador próprio no estado (`unknown_attempts`) para não se misturar com `attempts` de resposta inválida.
- Detecção por IA de "não sei": só usada quando a lista de frases não casa, reaproveitando a chamada de LLM já existente no turno (sem chamada extra).
- Testes Deno novos em `supabase/functions/ai-agent-sandbox/` cobrindo os 4 modos nos 4 idiomas, e verificando que o passo seguinte é o mesmo do fluxo normal.
- Deploy de `whatsapp-webhook` e `ai-agent-sandbox` para valer em produção e no sandbox.

## Fora do escopo

Não altera ordem de etapas, ramificações existentes, nem a configuração global do agente.
