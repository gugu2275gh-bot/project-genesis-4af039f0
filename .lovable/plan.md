# Validação do aproveitamento da 1ª mensagem

## O que já verifiquei no código (confirmado por leitura)

- `startFlowWithPrefill` valida cada dado aproveitado com a validação da própria etapa antes de aceitá-lo, e o laço `run` pula perguntas já respondidas seguindo o ramo correspondente — ou seja, **o fluxo retoma na primeira pergunta pendente**, como pedido (`_shared/flow-engine.ts:522-552`, `607-644`).
- As respostas aproveitadas são devolvidas em `captured` e o webhook as grava no CRM via `applyCapturedFields`; todos os campos que o intake produz (`contact.full_name`, `contact.email`, `funnel.location_known`, `funnel.interest_confirmed`, `funnel.entry_date_confirmed`, `contact.spain_arrival_date`, `funnel.empadronado_confirmed`, `funnel.empadronado_city`, `lead.service_interest`) têm destino tratado (`whatsapp-webhook/lib/visual-flow.ts:248-390`).
- `visual_flow_state.answers` recebe as respostas aproveitadas, então o turno seguinte (`advanceFlow`) continua com o histórico correto e não repergunta.

## Duas lacunas de continuidade confirmadas

1. **Reconhecimento humano por resposta aberta não acontece.** `renderAckMessage` existe em `_shared/flow-intake.ts` e o campo é editável na aba "Primeira mensagem", mas **nenhum ponto do motor, do webhook ou do sandbox o chama**. Hoje, após uma resposta aberta, o agente vai direto à próxima pergunta, sem a frase humana pedida.
2. **Saudação padrão nunca é usada.** Quando o intake não aproveita nada, `runIntake` devolve saudação vazia e o fluxo cai em `startFlow`, usando só a mensagem da etapa de INÍCIO. O campo "Saudação padrão" configurado na tela fica inerte.

Também não há **nenhum teste automatizado** cobrindo intake/prefill: os 480 testes atuais não exercitam esse caminho.

## Plano

### 1. Fechar a lacuna do reconhecimento humano
- Adicionar em cada etapa uma opção "Enviar reconhecimento antes da próxima pergunta" (padrão: ligado para respostas abertas — `TEXTO_LIVRE`, `NOME`, `EMAIL`; desligado para `SIM_NAO`/opções).
- No motor, ao avançar com resposta válida, prefixar a frase de reconhecimento do fluxo (`ack_message`, com `{nome}` resolvido a partir das respostas já capturadas) na primeira mensagem do próximo passo.
- Expor o interruptor no inspetor de etapas do editor visual.

### 2. Usar a saudação padrão
- Quando o intake está ligado e nada é aproveitado, enviar a "Saudação padrão" (se preenchida) antes das mensagens da etapa de INÍCIO; se estiver vazia, manter o comportamento atual.

### 3. Bateria de testes de continuidade (`supabase/functions/_shared/flow_intake_test.ts`)
Casos cobrindo exatamente os exemplos citados:
- "Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar" → nome, localização, data de entrada e intenção aproveitados; fluxo para na primeira pergunta **não** respondida; nenhuma das perguntas aproveitadas é reenviada.
- "My name is Robert. I live in US and want to go to Spain to work." → nome, fora da Espanha e intenção aproveitados; ramo "fora da Espanha" é seguido; idioma `en` na saudação e nas perguntas.
- Turno seguinte: resposta do cliente à pergunta pendente avança normalmente e **não** reabre as etapas aproveitadas.
- Dado abaixo da confiança mínima → descartado, pergunta é feita normalmente.
- Campo desabilitado na aba "Primeira mensagem" → ignorado mesmo quando extraído.
- Prefill que reprova na validação da etapa (ex.: intenção livre numa etapa de opções fixas) → descartado sem quebrar o fluxo.
- Todas as perguntas aproveitadas → fluxo chega ao handoff no primeiro turno com `finished`/`handoff` corretos.
- LLM indisponível ou JSON inválido → fluxo inicia normalmente (sem exceção).
- Reconhecimento humano: aparece nas respostas abertas e não aparece em Sim/Não.

### 4. Verificação ponta a ponta
- Rodar a suíte completa das Edge Functions (as 17 falhas atuais são do funil legado e pré-existentes; devem continuar iguais, sem novas).
- Testar as duas frases de exemplo no simulador (Sandbox) do AGENTE em produção e conferir os logs `[VISUAL_FLOW][INTAKE]`.
- Reimplantar `whatsapp-webhook` e `ai-agent-sandbox`.

## Detalhes técnicos
- Arquivos afetados: `supabase/functions/_shared/flow-engine.ts` (reconhecimento), `_shared/flow-intake.ts` (saudação padrão), `whatsapp-webhook/lib/visual-flow.ts`, `ai-agent-sandbox/index.ts`, `src/components/ai-agents/flow-builder/StepInspector.tsx` (interruptor por etapa) e novo `flow_intake_test.ts`.
- Sem mudanças de schema: o interruptor por etapa vai no JSON de configuração já existente da etapa.
