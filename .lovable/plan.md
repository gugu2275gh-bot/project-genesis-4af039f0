**O que aconteceu**

Do I know what the issue is? **Sim.** O problema não é só a validação de cidade: o funil ainda está deixando o LLM decidir avanços críticos com base em perguntas “já feitas”, não em respostas válidas registradas.

Pelo histórico real do lead `Fred William`, aconteceu isto:

1. O cliente respondeu `Não` para “Você está na Espanha?” e o estado foi salvo corretamente como `location_known = outside`.
2. Depois, no bloco “fora da Espanha”, o sistema considerou etapas como concluídas apenas porque a pergunta apareceu no histórico (`sentAny(...)`), mesmo quando a resposta foi pergunta fora do roteiro ou incompleta.
3. Quando o cliente perguntou `O que é isto?` sobre “trabalha remoto”, o gate mandou o LLM seguir para a próxima etapa em vez de explicar e repetir a pergunta atual. Isso pulou a resposta de trabalho remoto.
4. Após `Tenho`, o LLM ignorou o gate e voltou para o bloco “já na Espanha”, perguntando data de entrada — mesmo com `location_known = outside`.
5. Como não existe uma trava determinística final para o bloco correto, ele depois voltou a perguntar “familiar europeu...” de novo.

**Causa técnica principal**

- `index.ts` calcula o progresso do aprofundamento por **pergunta enviada** (`askedIdade`, `askedEuropa`, `askedFamiliar`, etc.), não por **resposta validada**.
- `isStructuredQuestionAnswer` é permissivo demais para texto curto e pode tratar coisa fora de contexto como resposta.
- O prompt/gate dá instruções, mas a resposta final ainda depende do LLM; não há um “roteador determinístico” que substitua a saída errada por exatamente a próxima pergunta válida.
- `buildStateDirective` usa o estado antigo (`funnelState`) em vez do estado atualizado no turno (`funnelStateLive`) na hora de montar a instrução final.

**Plano de correção**

1. **Criar validação determinística por pergunta atual**
   - Identificar a última pergunta real do bot.
   - Validar se a mensagem do cliente responde aquela pergunta específica.
   - Se não responder, não avançar.
   - Para perguntas factuais como “O que é isto?”, responder curto e repetir a pergunta pendente.

2. **Registrar progresso por resposta, não por pergunta enviada**
   - Usar o campo existente `outside_spain_progress` para marcar respostas válidas:
     - `age_answered`
     - `europe_recent_answered`
     - `family_answered`
     - `remote_answered`
     - `education_answered`
   - Não precisa criar tabela nem coluna nova.

3. **Corrigir respostas ambíguas**
   - Ex.: para “Possui familiar europeu ou residente legal na Espanha?”, `Minhas irmã` não confirma se é europeia/residente legal.
   - O bot deve pedir clarificação: “Sua irmã é europeia ou residente legal na Espanha?” em vez de avançar.

4. **Adicionar trava final de bloco**
   - Se `location_known = outside`, bloquear qualquer resposta que pergunte data de entrada, empadronamento ou cidade.
   - Se o LLM gerar uma pergunta do bloco errado, substituir deterministicamente pela próxima pergunta correta do bloco “fora da Espanha”.
   - Se todas as respostas válidas do bloco fora da Espanha estiverem registradas, enviar Pré-Handoff, não voltar para perguntas anteriores.

5. **Usar o estado atualizado no prompt**
   - Trocar `buildStateDirective(funnelState, ...)` para `buildStateDirective(funnelStateLive, ...)` para evitar instruções stale dentro do mesmo turno.

6. **Adicionar testes de regressão com o caso do print**
   - `Não estou na Espanha` nunca deve levar a “qual data de entrada na Espanha?”.
   - `O que é isto?` em “trabalha remoto?” deve explicar e repetir “Você trabalha remoto?”, não avançar.
   - `Minhas irmã` deve pedir clarificação, não aceitar como resposta completa.
   - Pergunta “familiar europeu...” não deve repetir depois de resposta validada.

7. **Validar com testes da Edge Function**
   - Rodar os testes existentes do `whatsapp-webhook` e os novos cenários antes de concluir.

**Resultado esperado**

O fluxo passa a funcionar como formulário conversacional com estado rígido: só avança quando a resposta é válida para a pergunta atual, não mistura blocos Espanha/fora da Espanha e não repete pergunta já respondida.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
  <presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>