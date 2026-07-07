// Testes para auto-detecção conservadora de location_known='spain'.
// Cobre PT/ES/EN/FR, rejeita passado/futuro/terceiros/condicional,
// e valida que nunca marca 'outside' automaticamente.
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { detectSpainResidenceClaim } from './lib/questions.ts'
import { computeDeterministicFunnelPatch } from './lib/overrides.ts'

// ===================== POSITIVOS =====================

Deno.test('PT: "estou na Espanha" — detecta', () => {
  assert(detectSpainResidenceClaim('estou na Espanha').matched)
  assert(detectSpainResidenceClaim('Já estou na Espanha há 2 anos').matched)
  assert(detectSpainResidenceClaim('moro na espanha').matched)
  assert(detectSpainResidenceClaim('vivo na Espanha desde 2023').matched)
  assert(detectSpainResidenceClaim('resido na Espanha').matched)
})

Deno.test('PT: "moro em <cidade ES>" — detecta', () => {
  assert(detectSpainResidenceClaim('moro em Madrid').matched)
  assert(detectSpainResidenceClaim('vivo em Barcelona').matched)
  assert(detectSpainResidenceClaim('estou em Valencia agora').matched)
})

Deno.test('ES: "estoy en España" — detecta', () => {
  assert(detectSpainResidenceClaim('estoy en España').matched)
  assert(detectSpainResidenceClaim('ya estoy en España hace 3 años').matched)
  assert(detectSpainResidenceClaim('vivo en España').matched)
  assert(detectSpainResidenceClaim('resido en España').matched)
  assert(detectSpainResidenceClaim('me encuentro en España').matched)
})

Deno.test('ES: "vivo en <ciudad>" — detecta', () => {
  assert(detectSpainResidenceClaim('vivo en Madrid').matched)
  assert(detectSpainResidenceClaim('estoy en Sevilla').matched)
  assert(detectSpainResidenceClaim('resido en Bilbao').matched)
})

Deno.test('EN: "I am in Spain" — detecta', () => {
  assert(detectSpainResidenceClaim("I'm in Spain").matched)
  assert(detectSpainResidenceClaim('I am currently in Spain').matched)
  assert(detectSpainResidenceClaim('I live in Spain').matched)
  assert(detectSpainResidenceClaim("I'm living in Spain").matched)
  assert(detectSpainResidenceClaim('I reside in Spain').matched)
  assert(detectSpainResidenceClaim("I'm in Madrid").matched)
})

Deno.test('FR: "je suis en Espagne" — detecta', () => {
  assert(detectSpainResidenceClaim('je suis en Espagne').matched)
  assert(detectSpainResidenceClaim("j'habite en Espagne").matched)
  assert(detectSpainResidenceClaim('je vis en Espagne').matched)
  assert(detectSpainResidenceClaim('je réside en Espagne').matched)
  assert(detectSpainResidenceClaim("j'habite à Valencia").matched)
})

// ===================== NEGATIVOS =====================

Deno.test('Passado NÃO deve marcar', () => {
  assertEquals(detectSpainResidenceClaim('estive na Espanha ano passado').matched, false)
  assertEquals(detectSpainResidenceClaim('morei em Madrid por 5 anos').matched, false)
  assertEquals(detectSpainResidenceClaim('estuve en España el año pasado').matched, false)
  assertEquals(detectSpainResidenceClaim('I was in Spain last year').matched, false)
  assertEquals(detectSpainResidenceClaim('I used to live in Spain').matched, false)
  assertEquals(detectSpainResidenceClaim("j'étais en Espagne").matched, false)
})

Deno.test('Futuro/intenção NÃO deve marcar', () => {
  assertEquals(detectSpainResidenceClaim('vou pra Espanha mês que vem').matched, false)
  assertEquals(detectSpainResidenceClaim('quero ir para a Espanha').matched, false)
  assertEquals(detectSpainResidenceClaim('penso em ir pra Madrid').matched, false)
  assertEquals(detectSpainResidenceClaim('quiero ir a España').matched, false)
  assertEquals(detectSpainResidenceClaim('voy a mudarme a España').matched, false)
  assertEquals(detectSpainResidenceClaim("I want to go to Spain").matched, false)
  assertEquals(detectSpainResidenceClaim("I'm going to move to Spain").matched, false)
  assertEquals(detectSpainResidenceClaim('je vais aller en Espagne').matched, false)
})

Deno.test('Terceiros NÃO deve marcar', () => {
  assertEquals(detectSpainResidenceClaim('minha família mora na Espanha').matched, false)
  assertEquals(detectSpainResidenceClaim('meu marido está em Madrid').matched, false)
  assertEquals(detectSpainResidenceClaim('mi familia vive en España').matched, false)
  assertEquals(detectSpainResidenceClaim('my son lives in Spain').matched, false)
  assertEquals(detectSpainResidenceClaim('ma mère habite en Espagne').matched, false)
})

Deno.test('Condicional NÃO deve marcar', () => {
  assertEquals(detectSpainResidenceClaim('se eu for pra Espanha, o que preciso?').matched, false)
  assertEquals(detectSpainResidenceClaim('quando eu chegar na Espanha').matched, false)
  assertEquals(detectSpainResidenceClaim('if I go to Spain').matched, false)
})

Deno.test('Menção casual sem verbo de residência NÃO deve marcar', () => {
  assertEquals(detectSpainResidenceClaim('conheço bem a Espanha').matched, false)
  assertEquals(detectSpainResidenceClaim('gosto da Espanha').matched, false)
  assertEquals(detectSpainResidenceClaim('Espanha é lindo').matched, false)
})

Deno.test('Cidade estrangeira NÃO deve marcar como spain', () => {
  assertEquals(detectSpainResidenceClaim('moro em Lisboa').matched, false)
  assertEquals(detectSpainResidenceClaim('vivo en Buenos Aires').matched, false)
  assertEquals(detectSpainResidenceClaim('I live in Paris').matched, false)
})

// ===================== INTEGRAÇÃO COM computeDeterministicFunnelPatch =====================

Deno.test('computeDeterministicFunnelPatch: auto-detecta spain no opener sem pergunta prévia', () => {
  const patch = computeDeterministicFunnelPatch(
    'Olá! Sou o assistente da CB. Como posso ajudar?',
    'Oi, já estou na Espanha e quero fazer nacionalidade',
  )
  assertEquals(patch.location_known, 'spain')
  assertEquals(patch.location_source, 'auto_opener_claim')
  assert(patch.location_evidence && patch.location_evidence.length > 0)
})

Deno.test('computeDeterministicFunnelPatch: NUNCA auto-detecta outside', () => {
  // Mesmo declarações fortes de "não estou na Espanha" fora da pergunta canônica
  // não devem marcar 'outside' — só a pergunta canônica pode fazer isso.
  const patch = computeDeterministicFunnelPatch(
    'Qual seu nome completo?',
    'Não estou na Espanha, vivo no Brasil',
  )
  assertEquals(patch.location_known, undefined)
  assertEquals(patch.location_source, undefined)
})

Deno.test('computeDeterministicFunnelPatch: pergunta canônica ainda funciona (sem auto-source)', () => {
  const patch = computeDeterministicFunnelPatch('¿Estás en España?', 'Sí')
  assertEquals(patch.location_known, 'spain')
  assertEquals(patch.location_source, undefined) // veio da resposta à pergunta, não do detector
})

Deno.test('computeDeterministicFunnelPatch: passado no opener NÃO auto-detecta', () => {
  const patch = computeDeterministicFunnelPatch(
    'Como posso ajudar?',
    'Estive na Espanha em 2020, agora quero voltar',
  )
  assertEquals(patch.location_known, undefined)
})

Deno.test('computeDeterministicFunnelPatch: terceiros no opener NÃO auto-detecta', () => {
  const patch = computeDeterministicFunnelPatch(
    'Como posso ajudar?',
    'Minha filha mora na Espanha e quero ir morar com ela',
  )
  assertEquals(patch.location_known, undefined)
})
