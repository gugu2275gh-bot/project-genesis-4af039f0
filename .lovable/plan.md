## Problema

No print, o cliente respondeu "Não tenho nome" → o bot **aceitou** como nome e avançou para email. Depois "Não tenho email" → guard de email re-perguntou (ok). Faltam 3 garantias:

1. Validar nome (rejeitar frases/recusas, não só 1-palavra).
2. Garantir que email obrigatório nunca seja pulado.
3. **Cada pergunta do pré-handoff é feita exatamente 1 vez por resposta válida** — não repetir perguntas já respondidas, e não avançar enquanto a resposta atual não passar na validação.

## Causas

- `isLikelyFullNameAnswer` (lib/name-extraction.ts) só checa denylist + ≥2 palavras. "Não tenho nome" passa.
- `forceReaskFullNameIfSingleWord` (lib/overrides.ts) só dispara para 1 palavra alfabética.
- Não existe um **gate determinístico de avanço de etapa**: a IA decide sozinha quando passar para a próxima pergunta, podendo (a) repetir pergunta já respondida, (b) avançar com resposta inválida.

## Solução

### 1. `lib/name-extraction.ts` — endurecer detecção de nome
- `NAME_REFUSAL_PATTERNS` (pt/es/en/fr): "não tenho [nome]", "no tengo [nombre]", "I don't have [a name]", "je n'ai pas [de nom]", "sem nome", "sin nombre", "without a name", "prefiro não dizer", "no quiero decir", etc.
- Heurística verbal: presença de verbos 1ª pessoa (`tenho|tengo|have|ai|quero|quiero|want|sou|soy|am|prefiro|prefer`) marca como frase, não nome.
- `isLikelyFullNameAnswer` retorna `false` se qualquer padrão acima casar.

### 2. `lib/overrides.ts` — re-pergunta firme em qualquer recusa/frase
- `forceReaskFullNameIfSingleWord`: além de 1-palavra, dispara também quando `!isLikelyFullNameAnswer(raw)` E a pergunta anterior era de nome.
- Nova `getFullNameRequiredReaskQuestion(language)` em `questions.ts`: copy mais firme ("Preciso do seu *nome completo* para continuar atendendo seu caso. Pode me informar?").
- `forceReaskEmailIfMissing`: já funciona; reforçar com `getEmailRequiredReaskQuestion` (copy firme após 2ª recusa).

### 3. **Gate determinístico de etapa do pré-handoff** (novo)

Criar `lib/prehandoff-gate.ts` exportando `enforcePreHandoffStepLock`:

**Entradas:** `funnelStateLive`, `contact`, `lastAssistantMessage`, `currentUserMessage`, `aiResponseClean`, `language`.

**Lógica (ordem de prioridade — primeira pergunta não-respondida vence):**

```text
step 1: nome completo válido?
  -> contact.full_name não auto-gerado E isLikelyFullNameAnswer-compatível
step 2: email válido?
  -> hasValidEmail(contact.email)
step 3: demais perguntas do pré-handoff (idade, país, data entrada, etc., conforme funil)
```

Para a primeira etapa **não satisfeita**:
- Se `lastAssistantMessage` JÁ era essa pergunta e `currentUserMessage` é resposta inválida → substituir `aiResponseClean` pela re-pergunta firme dessa etapa (ignorar o que a IA gerou).
- Se `lastAssistantMessage` era OUTRA pergunta e `aiResponseClean` está pulando → substituir pela pergunta correta dessa etapa.
- Se `aiResponseClean` está repetindo pergunta de etapa **já satisfeita** → substituir pela próxima pergunta pendente.

**Idempotência:** retorna `aiResponseClean` inalterado quando a IA já está fazendo exatamente a pergunta da etapa pendente atual.

Wire em `index.ts` logo após `stripRepeatedPreHandoff` e antes do split por `|||`.

### 4. Persistência defensiva (`index.ts`)
Quando a resposta do usuário falha em `isLikelyFullNameAnswer` ou `hasValidEmail`, **NÃO** persistir `contact.full_name`/`contact.email` nem marcar `name_source='client_provided'`. Garante que o gate da próxima volta veja o estado correto.

### 5. Testes (`prehandoff_gate_test.ts` + ampliar `name_email_refusal_test.ts`)

- Recusas pt/es/en/fr para nome e email → re-pergunta firme.
- Bot tenta pular nome → gate força pergunta de nome.
- Bot tenta repetir email já fornecido → gate força próxima pergunta.
- Nome válido ("Gustavo Braga") + email válido → gate é no-op.
- Falsos-positivos: "João Tenório", "Maria Tenente" → não bloqueados pela heurística verbal.
- Sequência completa simulada: nome inválido → re-pergunta → nome válido → email inválido → re-pergunta → email válido → próxima etapa.

## Critérios de aceite
- Cada pergunta do pré-handoff é emitida exatamente 1 vez por resposta válida.
- Nunca avança com nome=frase/recusa nem email ausente/inválido.
- Nunca repete pergunta cuja resposta já é válida.
- Copy de re-pergunta fica progressivamente mais firme.
- Suíte existente (132+) verde; ~12 novos testes verdes.

## Notas técnicas
- Sem migração SQL.
- Mudanças puramente determinísticas pós-LLM, sem alterar o prompt do agente.
- Idiomas: pt, es, en, fr.
