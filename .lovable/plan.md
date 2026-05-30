# Estender o short-circuit canônico para Msg3, Msg4, Msg5 e Msg6

## Objetivo

Hoje só a abertura (Msg1+Msg2) é determinística em todos os idiomas. As etapas seguintes ainda passam pelo LLM e dependem de "travas reativas" (`forceReaskEmailIfMissing`, `forceAdvanceFromInterestQuestion`, `ensureServicesAttachedToInterest`, etc.) para corrigir respostas erradas. Vamos eliminar a dependência do LLM nessas 4 mensagens, usando os textos já traduzidos em `lib/language.ts`.

## Mapeamento das bolhas

| Bolha | Conteúdo | Fonte canônica em `PromptTemplates` |
|---|---|---|
| Msg3 | Pergunta o nome completo | `askName` |
| Msg4 | Agradece + pede e-mail | `thanksThenAskEmail` |
| Msg5 | Pergunta o interesse | `interestQuestion` |
| Msg6 | Catálogo de serviços | `servicesCatalog` |

Todas já existem em PT/ES/EN/FR.

## Mudanças

### A) `supabase/functions/whatsapp-webhook/index.ts` — short-circuits determinísticos

Logo após o short-circuit da abertura, adicionar gates baseados no estado da conversa (já calculado: `hasFullName`, `hasEmail`, `interestCaptured`, `servicesAttached`, transcript), antes de cair na chamada ao LLM:

```ts
const tt = getPromptTemplates(detectedChatLanguage)

// Msg3: usuário respondeu "sim/ok" ao consentimento e ainda não temos nome
if (consentAccepted && !hasFullName) {
  aiResponse = tt.askName
}
// Msg4: acabou de mandar o nome, falta e-mail
else if (justAnsweredName && !hasEmail) {
  aiResponse = tt.thanksThenAskEmail
}
// Msg5: tem nome+email, ainda não perguntou interesse
else if (hasFullName && hasEmail && !interestAsked) {
  aiResponse = tt.interestQuestion
}
// Msg6: respondeu interesse, ainda não enviou catálogo
else if (interestCaptured && !servicesAttached) {
  aiResponse = `${tt.servicesCatalog}|||${tt.askLocationSpain}`
}
```

Cada gate emite `console.log('[CANONICAL_SHORTCIRCUIT] msgN', detectedChatLanguage)` para auditoria.

Reaproveitar os booleanos já existentes (`isFirstInteraction`, `hasFullName`, `hasEmail`) e derivar os novos (`consentAccepted`, `justAnsweredName`, `interestAsked`, `interestCaptured`, `servicesAttached`) a partir das regex já presentes nas funções `force*`/`ensureServicesAttachedToInterest`. Sem inventar lógica nova — só centralizar.

### B) Guard pós-processamento

Manter as funções `force*` atuais como **rede de segurança** (caso algum caminho futuro volte a passar pelo LLM). Não remover nada — apenas adicionar comentário `// fallback defensivo — short-circuit em A já cobre o caso feliz`.

### C) Prompt do LLM

Onde o system prompt ainda menciona Msg3–Msg6 com texto PT hardcoded, substituir por `getPromptTemplates(detectedChatLanguage).askName` etc. Para Msg5+Msg6 o LLM nunca mais deve ser chamado no caminho feliz, mas o reforço evita "vazamento" de PT em fallbacks.

### D) Testes

Novo `canonical_flow_test.ts`:
- Para cada idioma (pt-BR/es/en/fr) e cada gate (Msg3, Msg4, Msg5, Msg6), montar fixtures mínimas de estado da conversa e verificar que o short-circuit produz exatamente o texto de `PromptTemplates`.
- Verificar que Msg6 sai como `servicesCatalog|||askLocationSpain` (duas bolhas).

Expandir `opener_idempotency_test.ts` para garantir que, depois de Msg6, o fluxo cai de volta no LLM (não fica em loop nos gates).

### E) Deploy

Redeploy de `whatsapp-webhook` + rodar a suíte Deno.

## Arquivos tocados

- `supabase/functions/whatsapp-webhook/index.ts` (4 gates novos + reforço de prompt)
- `supabase/functions/whatsapp-webhook/canonical_flow_test.ts` (novo)
- `supabase/functions/whatsapp-webhook/opener_idempotency_test.ts` (expandir 1 caso)

## Fora do escopo

- Etapas 7 (localização/aprofundamento) e 8 (handoff) continuam com o padrão atual (LLM + travas reativas). Elas já funcionam consistentemente nos testes manuais; se quiser depois, aplicamos o mesmo padrão.
- Não muda nenhuma tabela, RLS ou frontend.

## Trade-off

Ganho: zero risco de o LLM traduzir errado, esquecer bolha ou misturar idiomas em Msg3–Msg6. Bug do PT desaparece estruturalmente.
Custo: respostas ficam fixas (sem variação tipo "Obrigado, Maria!" vs "Que bom te conhecer, Maria!"). Aceitável dado o histórico de quebras.
