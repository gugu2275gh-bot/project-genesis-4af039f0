import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripDuplicateShortOpeners } from './lib/overrides.ts'

Deno.test('PT: colapsa "Obrigado. Obrigado, Obrigado." mistura de pontuação', () => {
  const out = stripDuplicateShortOpeners('Obrigado. Obrigado, Obrigado. Qual é o melhor e-mail?', 'pt-BR')
  assertEquals(out, 'Obrigado. Qual é o melhor e-mail?')
})

Deno.test('PT: colapsa cauda repetida da pergunta', () => {
  const out = stripDuplicateShortOpeners('Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso? orientações e acompanhar seu caso?', 'pt-BR')
  assertEquals(out, 'Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?')
})

Deno.test('PT: caso real completo do Gustavo', () => {
  const input = 'Obrigado. Obrigado, Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso? orientações e acompanhar seu caso?'
  const out = stripDuplicateShortOpeners(input, 'pt-BR')
  assertEquals(out, 'Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?')
})
