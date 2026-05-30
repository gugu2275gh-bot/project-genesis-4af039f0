// Verifica que aberturas curtas duplicadas ("Obrigado. Obrigado.",
// "Perfeito. Perfeito.", "Gracias. Gracias.", etc.) são colapsadas e que
// bolhas redundantes "X." seguidas de "X. ..." são removidas.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripDuplicateShortOpeners, composeAckPlusScripted } from './lib/overrides.ts'

Deno.test('PT: colapsa "Obrigado. Obrigado." dentro da mesma bolha', () => {
  const out = stripDuplicateShortOpeners('Obrigado. Obrigado. Qual é o melhor e-mail?', 'pt-BR')
  assertEquals(out, 'Obrigado. Qual é o melhor e-mail?')
})

Deno.test('PT: colapsa "Perfeito. Perfeito." dentro da mesma bolha', () => {
  const out = stripDuplicateShortOpeners('Perfeito. Perfeito. Agora preciso entender.', 'pt-BR')
  assertEquals(out, 'Perfeito. Agora preciso entender.')
})

Deno.test('ES: colapsa "Gracias. Gracias."', () => {
  const out = stripDuplicateShortOpeners('Gracias. Gracias. ¿Cuál es tu e-mail?', 'es')
  assertEquals(out, 'Gracias. ¿Cuál es tu e-mail?')
})

Deno.test('EN: colapsa "Thank you. Thank you."', () => {
  const out = stripDuplicateShortOpeners('Thank you. Thank you. What is your email?', 'en')
  assertEquals(out, 'Thank you. What is your email?')
})

Deno.test('FR: colapsa "Merci. Merci."', () => {
  const out = stripDuplicateShortOpeners('Merci. Merci. Quel est votre e-mail?', 'fr')
  assertEquals(out, 'Merci. Quel est votre e-mail?')
})

Deno.test('Bolha standalone "Obrigado." seguida de bolha "Obrigado. Qual..." é removida', () => {
  const out = stripDuplicateShortOpeners('Obrigado.|||Obrigado. Qual é o melhor e-mail?', 'pt-BR')
  assertEquals(out, 'Obrigado. Qual é o melhor e-mail?')
})

Deno.test('Não toca quando openers são diferentes', () => {
  const out = stripDuplicateShortOpeners('Certo.|||Perfeito. Agora preciso entender.', 'pt-BR')
  assertEquals(out, 'Certo.|||Perfeito. Agora preciso entender.')
})

Deno.test('composeAckPlusScripted: descarta ack quando duplicaria opener', () => {
  const out = composeAckPlusScripted('Obrigado.', 'Obrigado. Qual é o melhor e-mail?', 'pt-BR')
  assertEquals(out, 'Obrigado. Qual é o melhor e-mail?')
})

Deno.test('composeAckPlusScripted: mantém ack quando opener difere', () => {
  const out = composeAckPlusScripted('Certo.', 'Perfeito. Agora preciso entender.', 'pt-BR')
  assert(out.startsWith('Certo.'))
  assert(out.includes('Perfeito. Agora preciso entender.'))
})

Deno.test('composeAckPlusScripted ES: descarta "Gracias." duplicado', () => {
  const out = composeAckPlusScripted('Gracias.', 'Gracias. ¿Cuál es tu e-mail?', 'es')
  assertEquals(out, 'Gracias. ¿Cuál es tu e-mail?')
})

Deno.test('composeAckPlusScripted: scripted multi-bolha usa "|||"', () => {
  const out = composeAckPlusScripted('Certo.', 'A|||B', 'pt-BR')
  assertEquals(out, 'Certo.|||A|||B')
})
