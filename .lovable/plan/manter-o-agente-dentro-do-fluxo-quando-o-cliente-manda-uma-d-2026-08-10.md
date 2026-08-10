# Manter o agente dentro do fluxo quando o cliente manda uma dúvida

## O que aconteceu no atendimento da imagem

O agente estava na etapa de pergunta geral ("me comente um pouco sobre você: idade, onde mora, formação, familiar europeu, Europa nos últimos 6 meses"). O cliente respondeu apenas `?`.

Como a mensagem contém `?`, o motor a classificou como "dúvida do cliente" e disparou o recurso **"responde e volta na hora"**: buscou na base de conhecimento e devolveu uma explicação longa sobre Arraigo de Segunda Oportunidade — assunto que nem foi perguntado — em vez de simplesmente reformular a pergunta da etapa.

Hoje esse comportamento é fixo no código: sempre que a mensagem "parece pergunta", ele responde pela base uma vez por etapa. Não existe nenhum controle disso no editor de fluxos.

## Como fica

Novo bloco no editor de fluxos, aba **Base de conhecimento** de cada etapa: **"Dúvidas do cliente durante a etapa"**, com três opções:

| Opção | Comportamento |
|---|---|
| Só retomar a pergunta (padrão nas etapas do fluxo ativo) | Ignora o desvio, reformula a pergunta da etapa em uma bolha só. Nada da base é usado. |
| Responder pela base e retomar | Comportamento atual: resposta curta da base + "Voltando ao seu caso: <pergunta>". |
| Mensagem fixa e retomar | Usa um texto cadastrado (multi-idioma) + a pergunta da etapa. |

Campos auxiliares do mesmo bloco:

- **Tamanho mínimo da dúvida** (padrão 12 caracteres): mensagens curtas como `?`, `oi?`, `como assim?` nunca contam como dúvida — o agente só repete a pergunta da etapa.
- **Quantas vezes responder por etapa** (padrão 1): depois disso só retoma a pergunta.

Nenhuma dessas regras fica escondida no código: o motor passa a ler a configuração da etapa. O que hoje é comportamento fixo vira o valor de configuração, e as etapas do fluxo ativo **Pre-hands-off-g-v3** já ficam gravadas com "Só retomar a pergunta".

## Detalhes técnicos

- `StepValidation` ganha `aside_answer?: { mode: 'SO_RETOMAR' | 'RESPONDER_BASE' | 'MENSAGEM_FIXA'; min_chars: number; attempts: number; messages: Record<lang,string> }`.
- Editor: novo componente `StepAsideAnswerEditor.tsx` renderizado dentro da aba "Base de conhecimento" do `StepInspector.tsx`, usando `MultiLangField` (com tradução automática) para a mensagem fixa.
- `flow-turn.ts`: o bloco "3) Responde e volta na hora" passa a consultar `asideAnswerOf(step)` — sem config na etapa, mantém o comportamento atual (`RESPONDER_BASE`, 1 tentativa) para não mudar fluxos antigos. `looksLikeQuestion` só vale acima de `min_chars`.
- Novo helper `asideAnswerOf` em `_shared/flow-answer-reask.ts`, com testes Deno cobrindo: `?` curto → só repergunta; dúvida longa com `SO_RETOMAR` → só repergunta; `RESPONDER_BASE` → resposta + ponte; `MENSAGEM_FIXA` → texto cadastrado + pergunta; limite de tentativas.
- Migração idempotente gravando `validation.aside_answer.mode = 'SO_RETOMAR'` nas 4 etapas do fluxo `Pre-hands-off-g-v3` (dado de configuração, editável depois na tela).
- Sandbox e produção usam o mesmo `advanceFlowTurn`, então o teste do agente reflete exatamente o WhatsApp.

## Fora do escopo

- Não muda o comportamento pós-handoff (modo livre com base de conhecimento).
- Não altera os demais fluxos inativos.
