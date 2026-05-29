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
