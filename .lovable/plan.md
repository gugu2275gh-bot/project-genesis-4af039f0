## Por que o agente não esperou a resposta

Consultei a etapa no banco. A etapa `msg_5_entender_interesse_msg_6_informar_` (ordem 5) está gravada assim:

- `step_kind: INFORMATIVA`
- `answer_type: TEXTO_LIVRE`
- `required: false`
- `next_step_code: msg_7_perguntar_localizacao`

O motor de fluxo (`supabase/functions/_shared/flow-engine.ts`) só **para e aguarda resposta** quando o tipo da etapa é `PERGUNTA`. Etapas `INICIO` e `INFORMATIVA` são apenas emitidas e o motor segue imediatamente para a próxima (`next_step_code`). Por isso ele mandou o texto do interesse e, no mesmo turno, já disparou a pergunta de localização.

## O que mudar na tela da etapa

Na etapa de ordem 5, no editor:

1. **Tipo da etapa** → trocar de `Informativa` para `Pergunta`. (Esse é o ajuste que resolve; sem ele nada mais tem efeito.)
2. **Tipo de resposta** → `Texto livre` (ou `Seleção`, se quiser oferecer nacionalidade / residência / estudos / arraigo / documento como opções fechadas).
3. **Resposta obrigatória** → marcar como obrigatória (`required = true`), para que resposta vazia gere repergunta em vez de avanço.
4. **Mensagem de repergunta** → preencher nos 4 idiomas, senão a repergunta sai genérica.
5. **Caminhos** → manter `Próxima etapa padrão = msg_7_perguntar_localizacao`. Se optar por opções fechadas, criar um caminho por opção com os equivalentes traduzidos.

## Plano de execução

1. Aplicar no banco, na etapa `msg_5_entender_interesse_msg_6_informar_`: `step_kind = PERGUNTA`, `required = true`, mantendo `next_step_code` atual.
2. Preencher `reask_messages` nos 4 idiomas ("Só para eu te direcionar certo: qual serviço você busca?").
3. Auditar as demais etapas do fluxo procurando outras marcadas como `INFORMATIVA` que terminam em ponto de interrogação — sinal do mesmo erro de configuração — e listar para sua confirmação antes de alterar.
4. Adicionar um aviso no editor de etapas: quando a mensagem contiver "?" e o tipo for `INFORMATIVA`, exibir alerta "Esta etapa não aguarda resposta".

## Detalhes técnicos

- Regra em `stepKindOf` / `run()` de `flow-engine.ts`: o loop só retorna com `finished: false` quando `kind === 'PERGUNTA'`.
- `step_kind` é persistido dentro do JSON `validation` da etapa, não em coluna própria.
- Nenhuma mudança no motor é necessária — só configuração e o alerta preventivo na UI.
