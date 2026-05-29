import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  stripAlreadySentCanonicalBlocks,
  lockConfirmedFieldsInResponse,
} from './lib/overrides.ts'
import { getServicesOfferedMessage } from './lib/questions.ts'

const PT = 'pt-BR' as const

const interestQ = 'Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico.'
const catalog = getServicesOfferedMessage(PT)

Deno.test('strip dedup: drops repeated catalog + interest question, keeps ack and appends location', () => {
  const aiResponse = `Certo.\n\n${interestQ}\n\n${catalog}`
  const transcript = `Olá!\n${interestQ}\n${catalog}`
  const recent = [interestQ, catalog]
  const out = stripAlreadySentCanonicalBlocks(
    aiResponse,
    transcript,
    PT,
    { nameKnown: true, emailKnown: true, interestKnown: true, locationKnown: false },
    recent,
  )
  assertStringIncludes(out.toLowerCase(), 'certo')
  assert(!out.includes('Na CB trabalhamos'), 'catalog should be dropped')
  assert(!/o que você busca hoje/i.test(out), 'interest question should be dropped')
  // Should append the location question
  assert(/espanha|spain/i.test(out), `expected location question to be appended, got: ${out}`)
})

Deno.test('strip dedup: keeps fresh catalog when not previously sent', () => {
  const aiResponse = `Antes de seguir, deixa eu te apresentar.\n\n${catalog}`
  const out = stripAlreadySentCanonicalBlocks(
    aiResponse,
    'olá tudo bem?', // transcript without catalog
    PT,
    { nameKnown: true, emailKnown: true, interestKnown: true, locationKnown: false },
    ['olá tudo bem?'],
  )
  assertStringIncludes(out, 'Na CB trabalhamos')
})

Deno.test('lockConfirmedFieldsInResponse: removes mid-response interest question when interest known', () => {
  const aiResponse = `Certo. ${interestQ} Você está na Espanha?`
  const out = lockConfirmedFieldsInResponse(aiResponse, PT, {
    nameKnown: true, emailKnown: true, interestKnown: true, locationKnown: false,
  })
  assert(!/o que você busca hoje/i.test(out), `interest question should be stripped, got: ${out}`)
})

import { dedupOpenerAcrossBubbles } from './lib/overrides.ts'

Deno.test('Pedro case: drops re-asked entry-date question in ES even when prev msg was long', () => {
  const prev = '¿Cuál fue la fecha exacta de tu entrada en España?\n\nComo prometí, sobre tu duda anterior: Entendido. Por favor, proporciona la fecha completa de tu entrada en España, incluyendo día, mes y año, para poder continuar.\n\nEn breve uno de nuestros especialistas podrá ayudarte con eso. Por favor, aguarda.'
  const aiResponse = '¿Cuál fue la fecha exacta de tu entrada en España?'
  const out = stripAlreadySentCanonicalBlocks(
    aiResponse,
    prev,
    'es' as const,
    { nameKnown: true, emailKnown: true, interestKnown: true, locationKnown: true },
    [prev],
  )
  // Deve ter sido removida (fallback retorna original quando kept===0 — então comparamos
  // a CONTAGEM de ocorrências da frase no resultado vs no input).
  // Como kept fica vazio, a função retorna aiResponse original. Aceitamos isso só se
  // o caller decidir descartar. Aqui validamos que o LOG do drop aconteceu via mudança:
  // a função retorna aiResponse intacto quando todos foram removidos → o caller (index.ts)
  // ainda envia. Para garantir que NÃO envia, mudamos: kept vazio deve retornar string vazia.
  assert(out.trim() === '' || out !== aiResponse, `expected to drop or empty, got: ${out}`)
})

Deno.test('opener dedup: removes second "Perfecto." across bubbles', () => {
  const input = 'Perfecto. Ya tengo una visión inicial de tu caso.|||Perfecto. ¿Estás empadronado?'
  const out = dedupOpenerAcrossBubbles(input)
  const parts = out.split('|||')
  assertEquals(parts.length, 2)
  assertStringIncludes(parts[0], 'Perfecto')
  assert(!/^Perfecto/i.test(parts[1].trim()), `second bubble should not start with Perfecto, got: ${parts[1]}`)
  assertStringIncludes(parts[1], '¿Estás empadronado?')
})

Deno.test('opener dedup: no-op when openers differ', () => {
  const input = 'Perfecto. Algo.|||Vale. Otra cosa.'
  const out = dedupOpenerAcrossBubbles(input)
  assertEquals(out, input)
})
