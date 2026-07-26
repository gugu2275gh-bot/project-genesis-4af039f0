## Objetivo

Trocar o conceito de **"Se não souber"** por **"Resposta diferente do esperado"** e disponibilizar essa aba/bloco em **todos** os editores de etapa — inclusive o diálogo "Editar etapa" da lista (onde hoje ela não aparece, causa do que você viu na etapa 13).

O escopo passa a cobrir qualquer resposta fora do esperado, não só "não sei":
- cliente diz que não sabe / não lembra;
- resposta em formato inválido (ex.: data fora de DD/MM/AAAA);
- resposta fora das opções previstas (não bate com nenhum caminho);
- resposta vazia, off-topic ou uma pergunta de volta.

## Interface (por etapa)

Bloco/aba **"Resposta diferente do esperado"** com:

1. **Tipo de desvio** — lista com as 4 situações acima. Cada uma pode ter tratamento próprio, ou usar a regra padrão da etapa.
2. **Comportamento** por situação:
   - Insistir na pergunta (padrão)
   - Aceitar valor aproximado (para datas/números)
   - Pular a etapa gravando um valor de reserva
   - Ir para a etapa de fallback
3. **Mensagem de acolhimento** multi-idioma (PT/ES/EN/FR) com tradução automática, específica de cada situação.
4. **Tentativas antes de aplicar** o comportamento.
5. **Valor gravado ao pular**.
6. **Frases extras** que caracterizam o desvio (além das já reconhecidas automaticamente nos 4 idiomas).

Em todos os modos a **sequência do fluxo não muda**: ao aceitar ou pular, segue para a mesma próxima etapa configurada.

## Onde aparece

- Editor visual (`flow-builder/StepInspector.tsx`) — aba renomeada.
- Diálogo "Editar etapa" da lista de etapas (`FlowsManagement.tsx`) — bloco novo, hoje ausente.
Ambos gravam no mesmo lugar, então o que for configurado em um aparece no outro.

## Detalhes técnicos

- `src/types/ai-agent-flow-builder.ts`: renomear `UnknownAnswerConfig` → `UnexpectedAnswerConfig` e ampliar a estrutura para um mapa por situação (`unknown` | `invalid_format` | `no_match` | `off_topic`), cada uma com `mode`, `messages`, `attempts`, `fallback_value`, `phrases`. O normalizador aceita o formato antigo (`validation.unknown_answer` plano) e converte para a nova forma, sem migração de banco.
- `StepUnknownAnswerEditor.tsx` → `StepUnexpectedAnswerEditor.tsx`, com seletor de situação e os campos acima.
- `FlowsManagement.tsx`: importar e renderizar o editor no `StepDialog`, gravando em `validation.unexpected_answer`.
- `supabase/functions/_shared/flow-engine.ts`: classificar o desvio (não sabe / formato inválido / sem correspondência / off-topic) e aplicar a regra da situação correspondente, com fallback para a regra `unknown` quando a situação não estiver configurada. Mantém a detecção multi-idioma e `parseApproxDate` já existentes.
- Testes: estender `supabase/functions/ai-agent-sandbox/unknown-answer_test.ts` (renomeado para `unexpected-answer_test.ts`) cobrindo cada situação e a retrocompatibilidade com configurações antigas.
