## Objetivo
Validar que a cidade respondida na pergunta "Em qual cidade você está empadronado?" é uma cidade válida da Espanha. Se não for, repetir a pergunta até receber uma cidade espanhola válida.

## Mudanças

### 1. Nova lib `lib/spanish-cities.ts`
- Lista canônica de municípios espanhóis (usar dataset estático com os ~8.100 municípios INE, ou no mínimo top ~500 + todas capitais de província + comunidades autônomas).
- Função `isValidSpanishCity(input: string): boolean` — normaliza (lowercase, sem acentos, trim) e compara contra o set. Aceita variações comuns ("a coruña" / "la coruña", "donostia" / "san sebastian", "palma" / "palma de mallorca").
- Função `extractCityFromAnswer(text: string): string | null` — extrai o token de cidade de respostas curtas ("barcelona", "en madrid", "vivo en sevilla").

### 2. `lib/questions.ts`
- Adicionar `getInvalidCityReprompt(language)` em PT/ES/EN/FR — ex.: "No encontré esa ciudad en España. ¿Puedes confirmar el nombre del municipio español donde estás empadronado?"
- Adicionar detector `isQuestionAboutEmpadronadoCity(q)` (regex multi-idioma para "qual cidade ... empadronad" / "qué/en qué ciudad ... empadronad" / "which city ... registered" / "quelle ville ... empadronad").

### 3. `lib/overrides.ts` — nova função `forceValidateSpanishCity`
- Disparada quando a última pergunta do agente foi B5 (cidade de empadronamento).
- Extrai cidade da resposta do cliente; se inválida, substitui a `aiResponse` pela reprompt traduzido e marca `empadronado_city_confirmed = false` no estado do funil para não avançar.
- Se válida, deixa fluir e persiste a cidade.

### 4. `lib/funnel-state.ts`
- Adicionar campo `empadronado_city: string | null` ao `FunnelState` (+ migration).
- `computeNextStep` / `buildStateDirective` continuam iguais (cidade faz parte do levantamento B5).

### 5. `index.ts`
- Após o bloco de overrides do empadronamento (linha ~1976), invocar `forceValidateSpanishCity(...)` quando a pergunta anterior foi B5.
- Atualizar a regex `askedCidade` no funnel tracker para considerar B5 só completa quando uma cidade válida foi capturada (`state.empadronado_city != null`), forçando o LLM a permanecer no passo até obter cidade válida.
- Acrescentar instrução no prompt B5: "Se a cidade respondida não for um município espanhol válido, peça para reconfirmar — NÃO avance para o próximo passo."

### 6. Migration
`alter table lead_funnel_state add column empadronado_city text;`

### 7. Testes
- `wave5_test.ts`: novo teste — após pergunta B5, resposta "Lisboa" → reprompt; resposta "Barcelona" → avança.

### 8. Deploy
Redeploy `whatsapp-webhook` e teste via curl simulando B5 com "lisboa" (deve repergutar) e "barcelona" (deve avançar).

## Detalhes técnicos
- Dataset de municípios: incluir como JSON estático em `lib/spanish-cities.json` (gerado a partir do INE; ~8.100 entradas, ~150 KB). Normalização via `String.prototype.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.
- Aceitar nomes co-oficiais (ex.: "Girona"/"Gerona", "Lleida"/"Lérida", "A Coruña"/"La Coruña", "Donostia"/"San Sebastián", "Bilbo"/"Bilbao", "Iruña"/"Pamplona", "Eivissa"/"Ibiza") via tabela de aliases.
- Não bloquear se cliente escrever província ("Cataluña") — tratar como inválido e pedir o município específico.

## Arquivos editados
- novo: `supabase/functions/whatsapp-webhook/lib/spanish-cities.ts` (+ json)
- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/lib/overrides.ts`
- `supabase/functions/whatsapp-webhook/lib/funnel-state.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- nova migration
- `supabase/functions/whatsapp-webhook/wave5_test.ts`
