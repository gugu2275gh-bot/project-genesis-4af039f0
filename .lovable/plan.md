## O que aconteceu no atendimento do Pedro

Conferi o histórico do lead `7903e56e-36b2-40d9-9355-e9f49983b9c9`:

```text
12:39:14 Bot: Cuéntame... ¿qué buscas hoy? ... ¿Tu caso encaja en alguno de estos?
12:39:43 Pedro: Sí, ya tengo 2 años en España y quiero solicitar mi residencia
12:39:57 Bot: Anotado — trataré ese punto... ¿Estás en España?
12:40:06 Pedro: Sí
12:40:21 Bot: ¿Estás en España?
12:40:31 Pedro: Sí
12:40:37 Bot: ¿Estás en España?
12:40:58 Pedro: Sí, estoy en España
12:41:06 Bot: Perfeito. Agora preciso entender... Qual foi a data exata...
```

Estado atual no banco:
- `preferred_language = es`
- `service_interest = RESIDENCIA_PARENTE_COMUNITARIO`
- `location_known = spain`
- `pending_questions` ficou poluído com mensagens válidas do Pedro que não deveriam ter sido parqueadas.

## Causa raiz

1. **Resposta composta foi tratada como “fora do roteiro”**  
   A frase “Sí, ya tengo 2 años en España y quiero solicitar mi residencia” respondia duas coisas ao mesmo tempo: interesse em residência e localização na Espanha. O sistema capturou o serviço no banco, mas o classificador de off-topic tratou a mensagem como pedido pendente e respondeu “trataré ese punto...”, dando a impressão de que não entendeu.

2. **Localização não virou trava de avanço cedo o suficiente**  
   Mesmo depois do “Sí”, a etapa de localização ainda foi considerada pendente em turnos seguintes, então o hard-lock do roteiro substituiu a resposta pela mesma pergunta de localização.

3. **Faltou bloqueio final contra pergunta repetida**  
   A deduplicação atual olha mensagens recentes e algumas âncoras, mas não tem uma regra forte: “se uma pergunta de campo já confirmado apareceu, nunca envie; avance para a próxima pergunta canônica”.

4. **Vazamento de idioma no próximo passo**  
   A conversa estava em espanhol, mas uma camada posterior gerou/substituiu a pergunta de data com texto português. Falta um último validador antes do envio para garantir que perguntas canônicas saiam sempre no idioma travado.

## Plano de correção

### 1. Corrigir interpretação da resposta composta

No classificador/off-topic e no patch determinístico:
- Se a mensagem contém serviço válido (`residencia`, `arraigo`, `nacionalidad`, etc.), não parqueá-la como off-topic quando a etapa esperada é interesse/catálogo.
- Se a mesma mensagem também contém sinal claro de localização (“estoy en España”, “2 años en España”, “vivo en España”), gravar `location_known = spain` no mesmo turno.
- Se contém “quiero solicitar mi residencia”, manter como interesse confirmado, não como dúvida pendente.

### 2. Tornar localização uma trava global

Adicionar um guard determinístico antes do hard-lock:
- Se `location_known` já está preenchido, é proibido emitir qualquer variação de “¿Estás en España?”.
- Se o cliente respondeu sim/não à última pergunta de localização, gravar e avançar no mesmo turno, sem depender do LLM.
- Se a pergunta de localização já foi feita no histórico e existe resposta afirmativa/negativa logo depois, reconstruir o estado e avançar.

### 3. Corrigir o dispatcher da próxima pergunta

Ajustar `getNextScriptedQuestion`/hard-lock para:
- Usar sempre o estado já atualizado (`funnelStateLive`) antes de escolher `nextStep`.
- Para Pedro, após `location_known = spain`, a próxima pergunta deve ser a data de entrada, em espanhol:
  `Perfecto. Ahora necesito entender tu situación aquí.

¿Cuál fue la fecha exacta de tu entrada en España? Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025).`

### 4. Bloqueio final de idioma

Antes de enviar pelo Twilio:
- Validar que a resposta não contém perguntas canônicas em outro idioma.
- Se `preferred_language = es`, substituir qualquer pergunta PT/EN/FR do roteiro pela versão espanhola correspondente.
- Aplicar isso a todas as perguntas do fluxo: abertura, nome, email, interesse, localização, data, empadronamento, cidade e pré-handoff.

### 5. Limpar o estado do Pedro

Sem alterar estrutura de tabelas:
- Manter `preferred_language = es`.
- Manter/corrigir `service_interest = RESIDENCIA_PARENTE_COMUNITARIO`.
- Manter/corrigir `lead_funnel_state.location_known = spain`.
- Remover de `pending_questions` as mensagens que eram respostas válidas: “Hola, buenos dias” e “Sí, ya tengo 2 años en España y quiero solicitar mi residencia”.
- Não enviar mensagem automática ao Pedro sem comando explícito; apenas deixar o próximo atendimento continuar corretamente em espanhol.

### 6. Testes obrigatórios

Adicionar testes Deno cobrindo:
- Resposta “Sí, ya tengo 2 años en España y quiero solicitar mi residencia” confirma interesse e localização, sem park/off-topic.
- Depois de “¿Estás en España?” + “Sí”, a próxima pergunta é data de entrada, não localização de novo.
- Nenhuma variação de localização é enviada se `location_known = spain`.
- Com idioma travado em espanhol, nenhuma pergunta canônica pode sair em português.
- Caso Pedro completo reproduzido ponta-a-ponta com a sequência real.