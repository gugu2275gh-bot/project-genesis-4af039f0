# Strict yes/no validation for the "Are you in Spain?" question

## Problem

Today the location detection (index.ts ~1664–1679) only looks for affirmative/negative signals. If neither is detected (e.g. "Não quero responder", "Fazer um doutorado", "talvez"), `userInSpain` and `userOutsideSpain` both stay `false` and the gate just keeps the step pending, so the LLM ends up free-styling — sometimes advancing to the next block ("Qual sua idade?") as seen in the attached WhatsApp screenshot, even though the location was never confirmed.

The user wants the same firm behavior already applied to name/email: never accept anything other than a clear Sim or Não, and if the answer is ambiguous, deterministically re-ask with **"Preciso saber se está na Espanha (Sim ou Não)"** (localized).

## Implementation

### 1. New helpers in `lib/questions.ts`
- `isQuestionAboutLocationSpain(text)` — already exists (re-use).
- `getLocationSpainRequiredReaskQuestion(lang)` returning, per language:
  - pt-BR: `Preciso saber se você está na Espanha (Sim ou Não).`
  - es: `Necesito saber si estás en España (Sí o No).`
  - en: `I need to know whether you are in Spain (Yes or No).`
  - fr: `J'ai besoin de savoir si vous êtes en Espagne (Oui ou Non).`

### 2. New classifier in `lib/name-extraction.ts` (or a new `lib/yesno.ts`)
- `classifyYesNo(text, lang)` → `'yes' | 'no' | 'ambiguous'`.
  - `'yes'` when matches the existing affirmative regex (`sim/si/yes/oui`, `estou/moro/vivo`, Spanish city names, etc.).
  - `'no'` when matches the negative regex (`não/no/nope/non`, `ainda não/todavía no/not yet/pas encore`, "outro país", country names like Brasil/Portugal/EUA, etc.).
  - `'ambiguous'` for everything else, including refusals (`não quero responder`, `prefiero no decir`), questions back at the bot, off-topic ("fazer um doutorado"), or unclear text.

This becomes the single source of truth and replaces the inline regex at index.ts:1666–1677.

### 3. New override `forceReaskLocationSpainIfAmbiguous` in `lib/overrides.ts`
Mirrors `forceReaskFullNameIfSingleWord` / `forceReaskEmailIfMissing`:
- Trigger only when the previous assistant question was the "Are you in Spain?" question (`isQuestionAboutLocationSpain(lastAssistantMessage)`).
- Run `classifyYesNo(rawCustomerMessage, lang)`.
- If `'ambiguous'`, replace the LLM output with `lock(getLocationSpainRequiredReaskQuestion(lang))` so it bypasses anti-loop/F4 dedup (the locked sentinel pattern already used).
- If `'yes'` or `'no'`, keep the LLM output (the gate logic will then advance correctly).

### 4. Wire into `index.ts`
- Import the new override and call it right after the existing `forceReaskFullNameIfSingleWord` / `forceReaskEmailIfMissing` calls (lines 2030–2031 and 2095–2096).
- Replace the inline `isAffirmative` / `isNegative` block (1664–1679) with `classifyYesNo(...)` so detection and override stay in sync.
- Off-topic parking already in place will still record the off-topic message — but we no longer let the LLM choose the response: the deterministic re-ask wins.

### 5. Gate hardening
At step `localizacao` in the gate (index.ts:1736–1741), update the instruction so when the previous turn already asked the location question and the customer answered ambiguously, the LLM instruction reads exactly: *"Reenvie literalmente: '{askLocationSpainRequiredReask}'. NÃO avance, NÃO faça nenhuma outra pergunta."* — but practically the override above makes this a fallback only.

### 6. Tests
New file `supabase/functions/whatsapp-webhook/location_spain_validation_test.ts`:
- `classifyYesNo` returns `'yes'` for "sim", "si", "yes", "oui", "estoy en Madrid", "moro em Barcelona".
- Returns `'no'` for "não", "no", "todavía no", "estou no Brasil", "Portugal".
- Returns `'ambiguous'` for "não quero responder", "fazer um doutorado", "talvez", "?", "".
- `forceReaskLocationSpainIfAmbiguous` replaces an LLM "Qual sua idade?" with the firm re-ask in PT/ES/EN/FR when the prior assistant turn was the Spain question and the user answered ambiguously.
- Override is a no-op when the answer is `'yes'`/`'no'` or when the previous assistant question wasn't about location.

Run `supabase--test_edge_functions { functions: ["whatsapp-webhook"] }` and ensure all existing tests still pass.

## Files touched (build phase)

- `supabase/functions/whatsapp-webhook/lib/questions.ts` — add `getLocationSpainRequiredReaskQuestion`.
- `supabase/functions/whatsapp-webhook/lib/name-extraction.ts` (or new `lib/yesno.ts`) — add `classifyYesNo`.
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` — add `forceReaskLocationSpainIfAmbiguous`.
- `supabase/functions/whatsapp-webhook/index.ts` — replace inline yes/no detection with `classifyYesNo`, call the new override, tighten gate instruction.
- `supabase/functions/whatsapp-webhook/location_spain_validation_test.ts` — new test file.

No DB migration. No frontend changes.
