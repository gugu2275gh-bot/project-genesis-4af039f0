## Diagnóstico confirmado

O atendimento do final **0909** está misturando idiomas por dois motivos confirmados:

1. **Contato novo nasce com `preferred_language = pt` por padrão no banco**
   - A coluna `contacts.preferred_language` tem default `'pt'`.
   - Por isso, ao chegar a primeira mensagem `Hello`, o webhook encontra um idioma “travado” em português antes de considerar o texto do cliente.

2. **O envio do fluxo usa o idioma errado em um ponto crítico**
   - O motor do fluxo calcula `flowLang`, mas o envio para Twilio usa `detectedChatLanguage`.
   - Em cenários com troca explícita ou estado salvo, isso pode gerar botão/template em idioma diferente do texto do fluxo.

Também confirmei que o fluxo **Pré-Handsoff** tem mensagens cadastradas em `pt-BR`, `es`, `en` e `fr`, então o problema não é falta de tradução das etapas.

## Plano de correção

1. **Separar “default do banco” de idioma realmente escolhido pelo cliente**
   - Tratar `preferred_language = pt` em contatos recém-criados como fallback, não como lock definitivo quando ainda não existe `visual_flow_state.lang`.
   - Na primeira mensagem com sinal claro (`Hello`, `Hola`, `Bonjour`, etc.), travar imediatamente o idioma detectado no contato e no estado do fluxo.

2. **Persistir o idioma do fluxo no primeiro turno**
   - Quando `visual_flow_state.lang` ainda não existir, gravar o idioma escolhido já no primeiro update do `lead_funnel_state`.
   - Isso impede que respostas curtas futuras como `Sim`, `no`, `yes`, `sí` alterem ou confundam o idioma.

3. **Usar sempre o mesmo idioma para texto e botões**
   - No envio das mensagens do fluxo, trocar `language: detectedChatLanguage` por `language: flowLang`.
   - Assim, se a etapa está em inglês, os botões também ficam em inglês; se está em espanhol, tudo fica em espanhol.

4. **Adicionar testes de regressão**
   - Caso 1: contato novo com default `pt`, primeira mensagem `Hello` → fluxo responde em `en` e grava `lang: en`.
   - Caso 2: idioma travado em `en`, cliente responde `Sim` → continua em `en`.
   - Caso 3: idioma travado em `pt-BR`, cliente responde `no` → continua em `pt-BR`.
   - Caso 4: pedido explícito de troca de idioma continua permitido.

5. **Validar com o caso 0909**
   - Conferir que o próximo atendimento não usa o default `pt` como lock falso.
   - Confirmar logs mostrando idioma travado por detecção real ou por estado do fluxo, não por default invisível.