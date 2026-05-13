// Idempotência dos preâmbulos A1 (outside) e B1 (spain) via flags persistidas
// em outside_spain_progress. 1ª emissão inclui preâmbulo, 2ª omite.

import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { forceCorrectBlockForLocation, stripLockedSentinel } from './lib/overrides.ts'

const A1_PREAMBLE = {
  'pt-BR': 'Entendido. Então seguimos pelo seu cenário fora da Espanha',
  'es': 'Entendido. Entonces seguimos por tu escenario fuera de España',
  'en': 'Got it. Then we’ll continue with your situation outside Spain',
  'fr': 'D’accord. Nous continuons donc avec votre situation hors d’Espagne',
} as const

// Para ES usamos a forma "cuántos años" pois é a âncora do regex isSpainOnlyQuestion;
// a IA pode emitir qualquer das duas formas e ambas devem disparar o lock.
const A2_QUESTION = {
  'pt-BR': 'Qual sua idade?',
  'es': '¿Cuántos años tienes?',
  'en': 'How old are you?',
  'fr': 'Quel âge avez-vous ?',
} as const

// A2 esperado de retorno (o que o sistema substitui) — pode ser a forma canônica curta
const A2_EXPECTED = {
  'pt-BR': 'Qual foi a data exata da sua entrada na Espanha?',
  'es': '¿Cuál fue la fecha exacta de tu entrada en España?',
  'en': 'What was the exact date you entered Spain?',
  'fr': 'Quelle est la date exacte de votre entrée en Espagne ?',
} as const

const B1_PREAMBLE = {
  'pt-BR': 'Perfeito. Agora preciso entender sua situação aqui.',
  'es': 'Perfecto. Ahora necesito entender tu situación aquí.',
  'en': 'Got it. Now I need to understand your situation here.',
  'fr': 'D’accord. Maintenant j’ai besoin de comprendre votre situation ici.',
} as const

const B2_QUESTION = {
  'pt-BR': 'Qual foi a data exata da sua entrada na Espanha?',
  'es': '¿Cuál fue la fecha exacta de tu entrada en España?',
  'en': 'What was the exact date you entered Spain?',
  'fr': 'Quelle est la date exacte de votre entrée en Espagne ?',
} as const

const LANGS = ['pt-BR', 'es', 'en', 'fr'] as const

// IA "errou" perguntando data de entrada para cliente OUTSIDE → deve voltar para A2
for (const lang of LANGS) {
  Deno.test(`A1 preâmbulo presente quando a1_scenario_sent=false (${lang})`, () => {
    const wrongQ = B2_QUESTION[lang]
    const out = forceCorrectBlockForLocation(wrongQ, lang, {
      locationKnown: 'outside',
      entryDateConfirmed: null,
      empadronadoConfirmed: null,
      empadronadoCity: null,
      assistantTranscript: '',
      outsideProgress: { a1_scenario_sent: false },
    } as any)
    const clean = stripLockedSentinel(out)
    assertStringIncludes(clean, A1_PREAMBLE[lang])
    assertStringIncludes(clean, A2_QUESTION[lang])
  })

  Deno.test(`A1 preâmbulo OMITIDO quando a1_scenario_sent=true (${lang})`, () => {
    const wrongQ = B2_QUESTION[lang]
    const out = forceCorrectBlockForLocation(wrongQ, lang, {
      locationKnown: 'outside',
      entryDateConfirmed: null,
      empadronadoConfirmed: null,
      empadronadoCity: null,
      assistantTranscript: '',
      outsideProgress: { a1_scenario_sent: true },
    } as any)
    const clean = stripLockedSentinel(out)
    assertStringIncludes(clean, A2_QUESTION[lang])
    assert(!clean.includes(A1_PREAMBLE[lang]), `A1 preâmbulo não pode reaparecer (${lang}): ${clean}`)
  })
}

// IA "errou" perguntando idade para cliente SPAIN → deve voltar para B1+B2
for (const lang of LANGS) {
  Deno.test(`B1 preâmbulo presente quando b1_situation_sent=false (${lang})`, () => {
    const wrongQ = A2_QUESTION[lang]
    const out = forceCorrectBlockForLocation(wrongQ, lang, {
      locationKnown: 'spain',
      entryDateConfirmed: null,
      empadronadoConfirmed: null,
      empadronadoCity: null,
      assistantTranscript: '',
      outsideProgress: { b1_situation_sent: false },
    } as any)
    const clean = stripLockedSentinel(out)
    assertStringIncludes(clean, B1_PREAMBLE[lang])
    assertStringIncludes(clean, B2_QUESTION[lang])
  })

  Deno.test(`B1 preâmbulo OMITIDO quando b1_situation_sent=true (${lang})`, () => {
    const wrongQ = A2_QUESTION[lang]
    const out = forceCorrectBlockForLocation(wrongQ, lang, {
      locationKnown: 'spain',
      entryDateConfirmed: null,
      empadronadoConfirmed: null,
      empadronadoCity: null,
      assistantTranscript: '',
      outsideProgress: { b1_situation_sent: true },
    } as any)
    const clean = stripLockedSentinel(out)
    assertStringIncludes(clean, B2_QUESTION[lang])
    assert(!clean.includes(B1_PREAMBLE[lang]), `B1 preâmbulo não pode reaparecer (${lang}): ${clean}`)
  })
}
