## Resposta curta

**Parcialmente.** O editor já modela a *estrutura* do seu diagrama, mas hoje ele é apenas de desenho: o agente em produção **não lê** esses fluxos.

### O que já é possível hoje
- Etapas em sequência (Msg 3, Msg 4, Msg 7…), com pergunta multi-idioma (PT/ES/EN/FR) e mensagem de reperguntar.
- Gateway "Está na Espanha?" → ramificações por resposta (igual/contém/regex/intenção/qualquer), cada uma apontando para uma etapa.
- Trilhas paralelas A1–A6 (fora) e B1–B5 (na Espanha) e o reencontro em "Dados coletados".
- Validações (e-mail, data DD/MM/AAAA, número, sim/não, seleção), campo do lead onde salvar a resposta, limite de reperguntas.
- "Não repetir etapa já cumprida" (pular se campo preenchido / etapa concluída / uma vez por contato).
- Etapa de handoff e importação do export **BPMN 2.0** do Bizagi (tarefas → etapas, gateways → ramificações, posições do diagrama).

### O que falta para o fluxo da imagem ficar 100%
1. **Textos das mensagens não vêm na importação.** No seu arquivo, os textos "Msg 1", "Msg 2"… estão em caixas de anotação (text annotation) ligadas às tarefas; o importador hoje só lê o campo "documentação" da tarefa, então as etapas chegam sem texto.
2. **Blocos com mais de uma mensagem** ("Msg 1-2 – Abertura", "Msg 5 + Msg 6", "Msg H1-H2") — hoje cada etapa envia uma única mensagem.
3. **Etapas só informativas, sem resposta** (Msg 6 – serviços atendidos, Msg H1–H3) — não existe tipo "apenas informar e seguir".
4. **Início e Fim** viram etapas comuns na importação, em vez de marcadores de início do fluxo e de encerramento/handoff.
5. **O agente não executa o fluxo desenhado.** O roteiro real está fixo em código (`flow-machine.ts`: ABERTURA → NAME → LOCATION → INSIDE/OUTSIDE → PRE_HANDOFF → HANDOFF). Mudar o desenho hoje não muda o atendimento.

## Plano proposto

### Fase 1 — Editor cobre o diagrama por completo
- Importador Bizagi: ler `textAnnotation` + `association` e usar o texto da caixa como mensagem da etapa (com fallback para a documentação); reconhecer "Msg N" no rótulo para ordenar.
- Etapa passa a ter **lista de mensagens** (1..n) por idioma, enviadas em sequência — cobre "Msg 1-2", "Msg 5+6", "Msg H1-H2".
- Novo tipo de etapa **Informativa** (sem resposta esperada, segue direto para a próxima).
- Marcadores **Início** e **Fim** dedicados no canvas; Fim pode marcar "encaminhar para especialista" (handoff).
- Validação do fluxo reforçada: um único início, toda etapa alcançável, ramificação sem destino, loop infinito.

### Fase 2 — Fluxo do desenho vira o fluxo executado
- O runtime do WhatsApp passa a carregar as etapas do agente em produção do banco e executá-las (perguntas, validações, ramificações, campos salvos, anti-repetição), mantendo o roteiro atual em código como fallback caso o agente não tenha fluxo publicado.
- Publicação por versão: alterações só afetam o atendimento após "Publicar", com possibilidade de voltar a versão anterior.
- Sandbox usa exatamente o mesmo motor, para testar antes de publicar.

### Detalhes técnicos
- `ai_agent_flow_steps`: usar `messages` como lista ordenada por idioma; novos valores de tipo de etapa (`INFORMATIVA`, `INICIO`, `FIM`) e flag de encerramento.
- `src/lib/bizagi-bpmn-import.ts`: mapear `bpmn:textAnnotation` via `bpmn:association` (sourceRef/targetRef nos dois sentidos).
- `supabase/functions/whatsapp-webhook/lib/flow-machine.ts`: extrair um executor genérico dirigido por dados, alimentado pelas etapas do agente; `agent-runtime.ts` carrega e cacheia o fluxo publicado.
- Testes: converter o roteiro atual em fluxo de dados e rodar a suíte existente (canonical, handoff, pré-handoff, multi-idioma) contra o motor novo para garantir zero regressão.

Posso executar só a Fase 1 (editor completo, sem tocar no atendimento) ou as duas.
