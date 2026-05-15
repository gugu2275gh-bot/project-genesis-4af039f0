import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { classifyYesNo, getLocationSpainRequiredReaskQuestion } from './lib/questions.ts'
import { forceReaskLocationSpainIfAmbiguous, stripLockedSentinel, isLocked } from './lib/overrides.ts'

Deno.test('classifyYesNo: yes', () => {
  for (const t of ['Sim', 'si', 'Yes', 'Oui', 'estoy en Madrid', 'moro em Barcelona', 'já estou na Espanha']) {
    assertEquals(classifyYesNo(t), 'yes', `expected yes for "${t}"`)
  }
})

Deno.test('classifyYesNo: no', () => {
  for (const t of ['Não', 'no', 'todavía no', 'estou no Brasil', 'Portugal', 'ainda não', 'not yet']) {
    assertEquals(classifyYesNo(t), 'no', `expected no for "${t}"`)
  }
})

Deno.test('classifyYesNo: ambiguous', () => {
  for (const t of ['Não quero responder', 'fazer um doutorado', 'talvez', '?', '', 'prefiero no decir', "I don't want to answer"]) {
    assertEquals(classifyYesNo(t), 'ambiguous', `expected ambiguous for "${t}"`)
  }
})

Deno.test('forceReaskLocationSpainIfAmbiguous: replaces LLM response when ambiguous', () => {
  const prev = 'Você está na Espanha?'
  const ai = 'Qual sua idade?'
  const out = forceReaskLocationSpainIfAmbiguous(prev, 'Não quero responder', ai, 'pt-BR')
  assertEquals(isLocked(out), true)
  assertEquals(stripLockedSentinel(out), getLocationSpainRequiredReaskQuestion('pt-BR'))
})

Deno.test('forceReaskLocationSpainIfAmbiguous: no-op on yes', () => {
  const prev = '¿Estás en España?'
  const ai = '¿Cuál fue la fecha exacta de tu entrada?'
  const out = forceReaskLocationSpainIfAmbiguous(prev, 'Sí, en Madrid', ai, 'es')
  assertEquals(out, ai)
})

Deno.test('forceReaskLocationSpainIfAmbiguous: no-op on no', () => {
  const prev = 'Are you in Spain?'
  const ai = 'How old are you?'
  const out = forceReaskLocationSpainIfAmbiguous(prev, 'No, I am in Brazil', ai, 'en')
  assertEquals(out, ai)
})

Deno.test('forceReaskLocationSpainIfAmbiguous: no-op when previous question is unrelated', () => {
  const prev = 'Qual seu nome completo?'
  const ai = 'Qual seu e-mail?'
  const out = forceReaskLocationSpainIfAmbiguous(prev, 'fazer um doutorado', ai, 'pt-BR')
  assertEquals(out, ai)
})

Deno.test('getLocationSpainRequiredReaskQuestion: localized', () => {
  assertEquals(getLocationSpainRequiredReaskQuestion('pt-BR'), 'Preciso saber se você está na Espanha (Sim ou Não).')
  assertEquals(getLocationSpainRequiredReaskQuestion('es'), 'Necesito saber si estás en España (Sí o No).')
  assertEquals(getLocationSpainRequiredReaskQuestion('en'), 'I need to know whether you are in Spain (Yes or No).')
  assertEquals(getLocationSpainRequiredReaskQuestion('fr'), "J'ai besoin de savoir si vous êtes en Espagne (Oui ou Non).")
})
