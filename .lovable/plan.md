# Plano: frase off-topic padrão + bloqueio total de re-perguntas

## Objetivo
1. Quando o usuário faz uma pergunta off-topic durante o pré-handoff (ex.: "O que é TIE?"), a resposta deve ser **exatamente** a frase pedida, traduzida por idioma — sem "Anotado", sem agradecimentos, sem reformulações.
2. Garantir que **nenhum dado já capturado** no pré-handoff (nome, e-mail, telefone, interesse/serviço, localização Espanha, data de entrada, cidade de empadronamiento, idade, etc.) seja perguntado novamente em nenhuma circunstância.

## Mudanças

### A) `supabase/functions/whatsapp-webhook/lib/offtopic.ts`
Substituir o corpo de `getOffTopicAckPhrase(language)` pelas frases exatas:

- **pt-BR:** `Por favor, vamos terminar o cadastro básico primeiro. Em seguida podemos tratar de outros assuntos.`
- **es:** `Por favor, terminemos primero el registro básico. A continuación podemos tratar otros temas.`
- **en:** `Please, let's finish the basic registration first. Afterwards we can address other matters.`
- **fr:** `S'il vous plaît, terminons d'abord l'enregistrement de base. Ensuite, nous pourrons aborder d'autres sujets.`

A frase é usada por `composeAckPlusScripted` como primeira bolha quando há pergunta scripted a seguir, e isolada quando não há — comportamento atual preservado.

### B) `supabase/functions/whatsapp-webhook/index.ts` — anti-re-ask universal de dados capturados

Hoje o `reAskRe` cobre apenas nome/e-mail/telefone dentro do loop de REPLAY. Vou:

1. **Extrair** a checagem para uma função `isReAskOfCapturedField(answer, captured)` que recebe o snapshot do que já foi capturado no lead (`full_name`, `email`, `phone`, `interest/service`, `location_spain`, `spain_entry_date`, `empadronamiento_city`, `age`, etc.) e retorna o campo violado, com regex multi-idioma por campo:
   - nome completo: `qual (é )?(o )?seu nome|cu[áa]l es tu nombre|what'?s your (full )?name|comment (vous |t')?appelez`
   - e-mail: `(seu |tu |votre )?(melhor )?(e-?mail|correo)|what'?s your email`
   - telefone/WhatsApp: `tel[eé]fono|phone( number)?|whatsapp`
   - interesse/serviço: `qual( é)? (o )?(seu )?interesse|servi[çc]o|tu caso encaja|qu[eé] servicio|which service`
   - localização Espanha: `est[áa]s? (en|na) espa[ñn]a|are you in spain|vous (êtes|etes) en espagne`
   - data entrada: `quando (você |voce )?(entrou|chegou)|cu[áa]ndo (entraste|llegaste)|when did you (enter|arrive)`
   - cidade empadronamiento: `em que cidade|en qu[eé] ciudad|in which city|empadronad`
   - idade: `qual (sua |a sua )?idade|cu[áa]ntos a[ñn]os|how old`

2. **Aplicar** a função em DOIS pontos:
   - Dentro do loop de REPLAY (substituindo o `reAskRe` atual), com log `[REPLAY] suppressed re-ask of captured field: <campo>`.
   - Logo após `generateAIResponse`/`generateAIResponseOpenAI` na resposta principal (fluxo normal, não-replay), com log `[GUARD] suppressed re-ask of captured field: <campo>` e descarte da bolha (ou da frase específica via split por linhas) antes do envio.

3. **Snapshot de capturados**: montar a partir do `lead` atual + `pendingExtraction`/dados extraídos no turno (já existem nos helpers). Onde o campo não estiver no lead, considerar não-capturado.

### C) `supabase/functions/whatsapp-webhook/offtopic_shortcircuit_test.ts`
Atualizar asserts para validar:
- pt: começa com `Por favor` e contém `cadastro básico`
- es: começa com `Por favor` e contém `registro básico`
- en: começa com `Please` e contém `basic registration`
- fr: começa com `S'il vous plaît` e contém `enregistrement de base`
- Mantém asserts de deduplicação existentes.

### D) Novo teste `supabase/functions/whatsapp-webhook/reask_guard_test.ts`
Cobertura unitária da função `isReAskOfCapturedField` para cada campo nos 4 idiomas, garantindo:
- detecta re-ask quando o campo está no snapshot capturado;
- NÃO bloqueia quando o campo ainda não foi capturado;
- não tem falso-positivo em frases neutras (ex.: "obrigado pelo seu email").

### E) Deploy
Redeploy de `whatsapp-webhook` após os testes passarem.

## Fora do escopo
- Nenhuma mudança em `lib/overrides.ts`, system prompt, gates de Msg3/4/5/6, UI, RLS, DB ou outras edge functions.
- Lógica de classificação off-topic (`classifyOffTopic`) permanece como está — só a frase muda.
