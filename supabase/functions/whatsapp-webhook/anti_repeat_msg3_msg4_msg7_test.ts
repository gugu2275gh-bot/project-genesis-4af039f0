// Anti-repetição global: Msg3 (nome), Msg4 (email) e Msg7 (localização)
// Verifica que preventRepeatedCanonicalQuestion substitui reperguntas
// quando os respectivos guards (nameKnown/emailKnown/locationKnown) estão setados.

import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { preventRepeatedCanonicalQuestion, isLocked, stripLockedSentinel } from './lib/overrides.ts'

// Quando nameKnown=true e ramo B incompleto, repergunta de nome vira B1 (data entrada)
Deno.test('Msg3: nameKnown=true → repergunta de nome substituída por B1 (pt-BR)', () => {
  const ai = 'Qual seu nome completo?'
  const out = preventRepeatedCanonicalQuestion(ai, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: true,
    emailKnown: true,
  })
  assert(isLocked(out), 'deve travar contra overrides posteriores')
  assertStringIncludes(stripLockedSentinel(out), 'data exata da sua entrada na Espanha')
})

Deno.test('Msg4: emailKnown=true + nome conhecido → email vira B1 (pt-BR)', () => {
  const ai = 'Qual o melhor email para contato?'
  const out = preventRepeatedCanonicalQuestion(ai, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: true,
    emailKnown: true,
  })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out), 'data exata da sua entrada na Espanha')
})

Deno.test('Msg3: nameKnown=false → repergunta de nome NÃO é substituída', () => {
  const ai = 'Qual seu nome completo?'
  const out = preventRepeatedCanonicalQuestion(ai, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: false,
    emailKnown: false,
  })
  assert(!isLocked(out))
  assertStringIncludes(out, 'nome completo')
})

// Msg7 — paráfrase de localização ("ainda no Brasil?", "where are you currently?")
Deno.test('Msg7: paráfrase pt "ainda no Brasil" + locationKnown=spain → vira B1', () => {
  const ai = 'Você ainda está em outro país?'
  const out = preventRepeatedCanonicalQuestion(ai, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: true,
    emailKnown: true,
  })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out), 'data exata da sua entrada na Espanha')
})

Deno.test('Msg7: paráfrase en "where are you currently" + locationKnown=spain → vira B1 (en)', () => {
  const ai = 'And where are you currently?'
  const out = preventRepeatedCanonicalQuestion(ai, 'en', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: true,
    emailKnown: true,
  })
  assert(isLocked(out))
  assertStringIncludes(stripLockedSentinel(out), 'exact date you entered Spain')
})

Deno.test('Msg7: locationKnown=null → paráfrase NÃO é substituída', () => {
  const ai = 'Você ainda está em outro país?'
  const out = preventRepeatedCanonicalQuestion(ai, 'pt-BR', {
    locationKnown: null,
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
    nameKnown: true,
    emailKnown: true,
  })
  assert(!isLocked(out))
})
