# Mensagem de espera não usada depois do pré-handoff (ambiente de teste)

## O que foi verificado

- O agente de produção "AGENTE 2.0" está com **Handoff liberado = desligado** e com a mensagem de espera correta salva nos 4 idiomas ("O especialista da CB Asesoría analisará o seu caso…"), atualizado às 12:13:21.
- Na sessão de teste das 12:14, depois da mensagem de transferência do fluxo, a pergunta "o que é nômade digital" foi respondida pelo **LLM Gemini** ("Estou encaminhando nossa conversa para um especialista. Aguarde por favor."), ou seja, o portão de handoff não foi aplicado no teste.
- Esse texto não existe em nenhum lugar do código nem do fluxo — foi inventado pelo modelo, confirmando que a chamada ao LLM aconteceu.
- Na produção (webhook do WhatsApp) o portão está implementado e checa o estado do pré-handoff antes de qualquer chamada ao LLM.

Causa provável (ainda não confirmada): no ambiente de teste, o portão só é avaliado depois do bloco do fluxo e usa a configuração possivelmente vinda do snapshot de versão, e não o cadastro atual do agente. A primeira etapa do trabalho é instrumentar e confirmar.

## Regra

Se existe mensagem de espera cadastrada no agente (ou o "Handoff liberado" está desligado) e o pré-handoff já terminou, a IA **não** é chamada: o sistema envia exatamente o texto cadastrado, no idioma da conversa. Nada de base de conhecimento, nada de modelo.

## O que será feito

1. **Confirmar o desvio**: adicionar um registro de diagnóstico no ambiente de teste mostrando, a cada turno, se o handoff está liberado ou bloqueado e qual idioma foi usado. Rodar um teste igual ao do usuário e ler o log.
2. **Ler sempre o cadastro atual do agente**: o interruptor "Handoff liberado" e a mensagem de espera passam a vir do registro do agente, mesmo quando a sessão de teste aponta para uma versão antiga (snapshots antigos não têm esses campos e não podem reabrir o handoff).
3. **Bloquear antes de qualquer LLM**: com o pré-handoff concluído e mensagem cadastrada (ou handoff bloqueado), o teste e a produção respondem apenas o texto cadastrado, sem consultar base de conhecimento nem modelo.
4. **Testes**: casos cobrindo (a) handoff bloqueado após o fluxo terminar → repete a mensagem cadastrada; (b) sessão com versão antiga selecionada → continua bloqueado; (c) handoff liberado e sem mensagem cadastrada → comportamento atual preservado.

## Detalhes técnicos

- `supabase/functions/ai-agent-sandbox/index.ts`: usar `agent.handoff_released` / `agent.handoff_hold_message` (linha do banco) em vez de `config.*`, adicionar log `[SANDBOX][HANDOFF_GATE]` e manter o curto-circuito antes do `buildSystemPrompt` e das chamadas Gemini/OpenAI.
- `supabase/functions/_shared/handoff-gate.ts`: sem mudança de regra; apenas coberto por novos testes.
- `supabase/functions/whatsapp-webhook/index.ts`: revisão do mesmo ponto para garantir que o snapshot de versão não reabra o handoff (o runtime já lê a linha do agente, com cache de 60s).

## Fora do escopo

- Não altera etapas, mensagens ou traduções dos fluxos existentes.
- Não muda o comportamento com "Handoff liberado" ligado.
