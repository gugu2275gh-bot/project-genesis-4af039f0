// Verifica que:
// 1) o detector reconhece "¿Estás en España?" curta isolada,
// 2) computeDeterministicFunnelPatch só grava interest (não localização)
//    para a resposta composta "Sí, ya tengo 2 años en España y quiero ...".
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { isQuestionAboutLocationSpain, classifyYesNo } from './lib/questions.ts'
import { computeDeterministicFunnelPatch } from './lib/overrides.ts'

Deno.test('isQuestionAboutLocationSpain reconhece forma curta ES "¿Estás en España?"', () => {
  assert(isQuestionAboutLocationSpain('¿Estás en España?'))
  assert(isQuestionAboutLocationSpain('Estás en España?'))
  assert(isQuestionAboutLocationSpain('Você está na Espanha?'))
  assert(isQuestionAboutLocationSpain('Are you in Spain?'))
  assert(isQuestionAboutLocationSpain('Êtes-vous en Espagne ?'))
})

Deno.test('classifyYesNo("Sí") => yes', () => {
  assertEquals(classifyYesNo('Sí'), 'yes')
  assertEquals(classifyYesNo('sim'), 'yes')
  assertEquals(classifyYesNo('No'), 'no')
})

Deno.test('computeDeterministicFunnelPatch: resposta composta de interesse NÃO grava location_known', () => {
  const prevQ = 'Cuéntame con calma: ¿qué buscas hoy? Puede ser nacionalidad, residencia, estudios, arraigo o algún documento específico.'
  const patch = computeDeterministicFunnelPatch(prevQ, 'Sí, ya tengo 2 años en España y quiero solicitar mi residencia')
  assertEquals(patch.location_known, undefined)
  assert(patch.interest_confirmed, 'deveria capturar interesse')
})

Deno.test('computeDeterministicFunnelPatch: "Sí" após pergunta de localização grava spain', () => {
  const patch = computeDeterministicFunnelPatch('¿Estás en España?', 'Sí')
  assertEquals(patch.location_known, 'spain')
})

Deno.test('computeDeterministicFunnelPatch: "No" após pergunta de localização grava outside', () => {
  const patch = computeDeterministicFunnelPatch('¿Estás en España?', 'No')
  assertEquals(patch.location_known, 'outside')
})

Deno.test('computeDeterministicFunnelPatch: "no estoy en España" fora do contexto NÃO grava localização', () => {
  const patch = computeDeterministicFunnelPatch('¿Cuál es tu nombre completo?', 'No estoy en España, vivo en Brasil')
  assertEquals(patch.location_known, undefined)
})
