// Idempotência da ABERTURA (Msg1 greeting + Msg2 consent) e re-greeting pós-nome.
// Verifica que stripRepeatedOpener substitui pela próxima canônica pendente
// quando outside_spain_progress.opener_sent=true.

import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripRepeatedOpener, isLocked, stripLockedSentinel } from './lib/overrides.ts'

const baseFlags = {
  locationKnown: null as 'spain' | 'outside' | null,
  entryDateConfirmed: null,
  empadronadoConfirmed: null,
  empadronadoCity: null,
  assistantTranscript: '',
  outsideProgress: { opener_sent: true } as any,
}

const GREETING_EN = "Hello 👋 Thank you for reaching out to CB Asesoría. I'll help you understand your legal pathways here in Spain."
const CONSENT_EN = "I'll ask you a few quick questions just to understand your case and direct you to the right specialist, is that okay?"
const REGREETING_EN_AFTER_NAME = "Great to meet you, Gustavo! 😊 I'll ask you a few quick questions, can we proceed?"

const LANGS = ['pt-BR', 'es', 'en', 'fr'] as const

// Greeting repetido com nameKnown=false → substituído por Msg3 (nome) nas 4 línguas.
Deno.test('opener: greeting repetido + opener_sent → vira Msg3 (nome) [en]', () => {
  const out = stripRepeatedOpener(GREETING_EN, 'en', { ...baseFlags, nameKnown: false, emailKnown: false })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out), 'full name')
})

Deno.test('opener: consent repetido + nameKnown=true → vira Msg4 (email) [en]', () => {
  const out = stripRepeatedOpener(CONSENT_EN, 'en', { ...baseFlags, nameKnown: true, emailKnown: false })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out).toLowerCase(), 'email')
})

Deno.test('opener: re-greeting pós-nome ("Great to meet you, X!...") strippado [en]', () => {
  const out = stripRepeatedOpener(REGREETING_EN_AFTER_NAME, 'en', { ...baseFlags, nameKnown: true, emailKnown: false })
  assert(isLocked(out))
  const clean = stripLockedSentinel(out)
  assertStringIncludes(clean.toLowerCase(), 'email')
  assert(!/great to meet you/i.test(clean))
})

Deno.test('opener: SEM opener_sent (1ª emissão) → greeting passa intacto', () => {
  const out = stripRepeatedOpener(GREETING_EN, 'en', {
    ...baseFlags,
    outsideProgress: { opener_sent: false } as any,
    nameKnown: false,
    emailKnown: false,
  })
  assert(!isLocked(out))
  assertStringIncludes(out, 'Thank you for reaching')
})

Deno.test('opener: detecta via transcript (sem flag explícita) — greeting já no histórico', () => {
  const out = stripRepeatedOpener(GREETING_EN, 'en', {
    ...baseFlags,
    outsideProgress: null,
    assistantTranscript: 'Hello 👋 Thank you for reaching out to CB Asesoría earlier...',
    nameKnown: false,
    emailKnown: false,
  })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out), 'full name')
})

// PT-BR / ES / FR — greeting + opener_sent + nameKnown=false → Msg3 nome
const GREETING_BY_LANG: Record<typeof LANGS[number], string> = {
  'pt-BR': 'Olá! 😊 Tudo bem? Sou a assistente virtual da CB Asesoria. É um prazer falar com você!',
  'es': 'Hola 😊 ¿Cómo estás? Gracias por hablar con CB Asesoría.',
  'en': GREETING_EN,
  'fr': 'Bonjour 😊 Merci de nous contacter chez CB Asesoría.',
}
const NAME_QUESTION_TOKEN: Record<typeof LANGS[number], RegExp> = {
  'pt-BR': /nome completo/i,
  'es': /nombre completo/i,
  'en': /full name/i,
  'fr': /nom complet/i,
}

for (const lang of LANGS) {
  Deno.test(`opener: greeting + opener_sent → Msg3 nome (${lang})`, () => {
    const out = stripRepeatedOpener(GREETING_BY_LANG[lang], lang, { ...baseFlags, nameKnown: false, emailKnown: false })
    assert(isLocked(out), `should be locked (${lang})`)
    assert(NAME_QUESTION_TOKEN[lang].test(stripLockedSentinel(out)), `should contain name question (${lang}): ${stripLockedSentinel(out)}`)
  })
}
