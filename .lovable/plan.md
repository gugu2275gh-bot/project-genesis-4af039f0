# Dúvidas do cliente também no editor em tabela (lista de etapas)

Hoje a configuração "Dúvidas do cliente durante a etapa" só aparece no editor visual (inspetor da etapa, aba "Base de conhecimento"). O objetivo é ter exatamente a mesma configuração na tela de **Agentes de IA → Fluxos → Etapas**, ao editar cada etapa pela tabela.

## O que muda na tela

Ao abrir **Editar etapa** pela lista de etapas, logo abaixo do bloco "Base de conhecimento" passa a existir o bloco **Dúvidas do cliente durante a etapa**, com:

- Modo: *Só retomar a pergunta* / *Responder pela base e retomar* / *Mensagem fixa e retomar*
- Tamanho mínimo da mensagem para ser tratada como dúvida (padrão 12 caracteres, evita "?")
- Quantas vezes responder à dúvida por etapa
- Campo de texto por idioma quando o modo for "Mensagem fixa"

Além disso, a tabela de etapas ganha uma indicação visual: quando a etapa estiver em "Só retomar a pergunta", aparece um selo discreto na coluna Tipo, para dar para conferir a configuração de todas as etapas de uma vez sem abrir cada uma.

A configuração é a mesma do editor visual: alterar num lugar reflete no outro, pois grava no mesmo campo da etapa.

## Detalhes técnicos

- `src/components/ai-agents/FlowsManagement.tsx`: importar `StepAsideAnswerEditor` e renderizá-lo dentro do bloco condicional de `PERGUNTA`/`PERGUNTA_GERAL` (após `StepUnexpectedAnswerEditor`), gravando em `validation.aside_answer` via o mesmo `set({ validation: { ... } })`.
- Selo na tabela: usar `normalizeAsideAnswer((s as any).validation?.aside_answer)` na linha da etapa e exibir badge "Só retoma" quando `mode === 'SO_RETOMAR'`.
- Nenhuma mudança no motor (`flow-turn.ts` / `flow-answer-reask.ts`) nem no banco — a leitura já existe.

## Verificação

Abrir o fluxo Pre-hands-off-g-v3 pela lista de etapas, editar uma etapa de pergunta e confirmar o bloco novo já preenchido com "Só retomar a pergunta"; capturar a tela para mostrar como ficou.
