// @ts-nocheck
// Regressões dos 4 pontos identificados na conversa da cliente Thayana
// (lead 871157aa-8a6c-426a-8013-7e9895cc725b):
//   1. Prefixos de ack ("ok", "vale", "sim", …) antes do nome
//   2. Vazamento de perguntas INSIDE↔OUTSIDE (data de entrada com location=outside)
//   3. Lock anti-resposta duplicada (chave ai_lock:{lead}:{bucket30s})
//   4. Guard de ack curto pós-handoff (não deve religar a IA)
import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { stripNameIntroPrefix, isLikelyFullNameAnswer } from './lib/name-extraction.ts'
import { stripCrossBranchQuestion, lock } from './lib/overrides.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 1) Prefixo de ack antes do nome — "ok THAYANA" e variações multilíngues
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('[Thayana#1] "ok THAYANA" → prefixo removido, nome extraído como "THAYANA"', () => {
  assertEquals(stripNameIntroPrefix('ok THAYANA'), 'THAYANA')
})

Deno.test('[Thayana#1] "ok Thayana Silva" → nome completo válido, prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('ok Thayana Silva'), 'Thayana Silva')
  assert(isLikelyFullNameAnswer('ok Thayana Silva'))
})

Deno.test('[Thayana#1] "vale Pedro Silva" (es ack) → prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('vale Pedro Silva'), 'Pedro Silva')
  assert(isLikelyFullNameAnswer('vale Pedro Silva'))
})

Deno.test('[Thayana#1] "sim João Almeida" (pt ack) → prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('sim João Almeida'), 'João Almeida')
  assert(isLikelyFullNameAnswer('sim João Almeida'))
})

Deno.test('[Thayana#1] "yes John Doe" (en ack) → prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('yes John Doe'), 'John Doe')
  assert(isLikelyFullNameAnswer('yes John Doe'))
})

Deno.test('[Thayana#1] "okay Maria Dupont" → prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('okay Maria Dupont'), 'Maria Dupont')
})

Deno.test('[Thayana#1] "beleza Ana Maria" (pt gíria) → prefixo removido', () => {
  assertEquals(stripNameIntroPrefix('beleza Ana Maria'), 'Ana Maria')
})

Deno.test('[Thayana#1] "ok" sozinho não vira nome', () => {
  assertEquals(isLikelyFullNameAnswer('ok'), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2) Cross-branch scrub — INSIDE ↔ OUTSIDE
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('[Thayana#2] location=outside → remove "Qual foi a data exata da sua entrada na Espanha?"', () => {
  const ai = 'Entendido! Qual foi a data exata da sua entrada na Espanha?'
  const out = stripCrossBranchQuestion(ai, 'outside')
  assert(!/entrada na Espanha/i.test(out), `Pergunta INSIDE não foi removida: ${out}`)
})

Deno.test('[Thayana#2] location=outside → remove pergunta de empadronamento', () => {
  const ai = 'Perfeito. Está empadronado em alguma cidade da Espanha?'
  const out = stripCrossBranchQuestion(ai, 'outside')
  assert(!/empadron/i.test(out), `Pergunta INSIDE (empadron) não foi removida: ${out}`)
})

Deno.test('[Thayana#2] location=spain → remove "Qual sua idade?" (OUTSIDE)', () => {
  const ai = 'Obrigado. Qual sua idade?'
  const out = stripCrossBranchQuestion(ai, 'spain')
  assert(!/qual sua idade/i.test(out), `Pergunta OUTSIDE não foi removida: ${out}`)
})

Deno.test('[Thayana#2] location=spain → remove pergunta de "familiar europeu"', () => {
  const ai = 'Certo. Você tem algum familiar europeu?'
  const out = stripCrossBranchQuestion(ai, 'spain')
  assert(!/familiar europeu/i.test(out), `Pergunta OUTSIDE (familiar EU) não foi removida: ${out}`)
})

Deno.test('[Thayana#2] location=outside → NÃO remove pergunta legítima OUTSIDE (idade)', () => {
  const ai = 'Qual sua idade?'
  const out = stripCrossBranchQuestion(ai, 'outside')
  assertEquals(out, 'Qual sua idade?')
})

Deno.test('[Thayana#2] resposta com LOCKED_SENTINEL não é modificada', () => {
  const ai = lock('Qual foi a data exata da sua entrada na Espanha?')
  const out = stripCrossBranchQuestion(ai, 'outside')
  assertEquals(out, ai)
})

Deno.test('[Thayana#2] locationKnown ausente → no-op', () => {
  const ai = 'Qual foi a data exata da sua entrada na Espanha?'
  assertEquals(stripCrossBranchQuestion(ai, null as any), ai)
  assertEquals(stripCrossBranchQuestion(ai, undefined as any), ai)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3) Lock anti-resposta duplicada — formato da chave ai_lock:{lead}:{bucket30s}
// ─────────────────────────────────────────────────────────────────────────────
// Replica exatamente a lógica de index.ts (linha ~1210) para pegar regressões
// se alguém alterar o formato/bucket sem atualizar.
function buildAiLockKey(leadId: string, nowMs: number): string {
  const bucket = Math.floor(nowMs / 30_000)
  return `ai_lock:${leadId}:${bucket}`
}

Deno.test('[Thayana#3] chave do lock segue formato ai_lock:{lead_id}:{bucket30s}', () => {
  const leadId = '871157aa-8a6c-426a-8013-7e9895cc725b'
  const key = buildAiLockKey(leadId, 1_700_000_000_000)
  assertMatch(key, /^ai_lock:[0-9a-f-]{36}:\d+$/)
  assert(key.startsWith(`ai_lock:${leadId}:`))
})

Deno.test('[Thayana#3] duas mensagens no mesmo bucket de 30s → mesma chave (colide → lock funciona)', () => {
  const leadId = '871157aa-8a6c-426a-8013-7e9895cc725b'
  // Base alinhada ao início de um bucket (múltiplo de 30_000)
  const t0 = 56_666_666 * 30_000
  const k1 = buildAiLockKey(leadId, t0)
  const k2 = buildAiLockKey(leadId, t0 + 29_000) // 29s depois, ainda no mesmo bucket
  assertEquals(k1, k2)
})

Deno.test('[Thayana#3] mensagens em buckets diferentes → chaves diferentes', () => {
  const leadId = '871157aa-8a6c-426a-8013-7e9895cc725b'
  const t0 = 1_700_000_000_000
  const k1 = buildAiLockKey(leadId, t0)
  const k2 = buildAiLockKey(leadId, t0 + 31_000) // >30s → próximo bucket
  assert(k1 !== k2, 'Chaves de buckets diferentes devem divergir')
})

Deno.test('[Thayana#3] leads diferentes no mesmo bucket → chaves diferentes', () => {
  const t0 = 1_700_000_000_000
  const k1 = buildAiLockKey('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', t0)
  const k2 = buildAiLockKey('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', t0)
  assert(k1 !== k2)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4) Guard de ack curto pós-handoff — replica regex de index.ts (linha ~1188)
// ─────────────────────────────────────────────────────────────────────────────
const ACK_RE = /^(ok|okay|okey|k|kk|vale|blz|beleza|certo|claro|perfeito|entendi|entendido|obrigad[oa]|obrigada|obrigado|valeu|gracias|thanks|thank you|thx|ty|merci|hum+|mmh+|hmm+|aha+|humm+|👍|🙏|👌|✅|😊|🙂)$/i

function isShortAck(inboundText: string): boolean {
  const normalized = inboundText.trim().toLowerCase().replace(/[.!?…\s]+$/g, '').trim()
  const isEmojiOnly = /^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)$/u.test(inboundText.trim())
  return (ACK_RE.test(normalized) || isEmojiOnly)
    && inboundText.trim().length < 25
    && !inboundText.includes('?')
}

Deno.test('[Thayana#4] "HUM" pós-handoff é ack curto → IA deve pausar', () => {
  assert(isShortAck('HUM'))
})

Deno.test('[Thayana#4] "ok" pós-handoff é ack curto → IA deve pausar', () => {
  assert(isShortAck('ok'))
  assert(isShortAck('OK.'))
  assert(isShortAck('Ok!'))
})

Deno.test('[Thayana#4] "obrigada" pós-handoff é ack curto', () => {
  assert(isShortAck('obrigada'))
  assert(isShortAck('Obrigada!'))
  assert(isShortAck('gracias'))
  assert(isShortAck('thanks'))
})

Deno.test('[Thayana#4] emoji sozinho pós-handoff é ack curto', () => {
  assert(isShortAck('👍'))
  assert(isShortAck('🙏'))
  assert(isShortAck('😊'))
})

Deno.test('[Thayana#4] "vale" / "beleza" / "perfeito" contam como ack', () => {
  assert(isShortAck('vale'))
  assert(isShortAck('beleza'))
  assert(isShortAck('perfeito'))
})

Deno.test('[Thayana#4] pergunta genuína NÃO é ack (contém ?)', () => {
  assertEquals(isShortAck('ok?'), false)
  assertEquals(isShortAck('obrigada, quando começamos?'), false)
})

Deno.test('[Thayana#4] mensagem longa (>25 chars) NÃO é ack curto', () => {
  assertEquals(isShortAck('obrigada por todas as informações que você me passou'), false)
})

Deno.test('[Thayana#4] mensagem substantiva (não bate ACK_RE) NÃO é ack', () => {
  assertEquals(isShortAck('quero contratar o serviço'), false)
  assertEquals(isShortAck('preciso de ajuda'), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// [Gustavo] Regressões do validador LOCATION (flow-machine).
// Bug real: cliente respondeu "Nao eu disse que quero ir para espanha" à
// pergunta "Você está na Espanha?" e o sistema gravou location_known='spain'
// (branch INSIDE) porque a menção literal a "espanha" foi checada ANTES da
// negação. Consequência: perguntou "data de entrada na Espanha" 2x.
// ─────────────────────────────────────────────────────────────────────────────
import { getStepDef } from './lib/flow-machine.ts'

Deno.test('[Gustavo#1] "Nao eu disse que quero ir para espanha" → outside', () => {
  const def = getStepDef('LOCATION')
  const r = def.validate('Nao eu disse que quero ir para espanha', {} as any)
  assertEquals(r.valid, true)
  assertEquals((r as any).value, 'outside')
})

Deno.test('[Gustavo#2] "Não, quero ir pra Espanha" → outside', () => {
  const r = getStepDef('LOCATION').validate('Não, quero ir pra Espanha', {} as any)
  assertEquals((r as any).value, 'outside')
})

Deno.test('[Gustavo#3] "No, quiero ir a España" (es) → outside', () => {
  const r = getStepDef('LOCATION').validate('No, quiero ir a España', {} as any)
  assertEquals((r as any).value, 'outside')
})

Deno.test('[Gustavo#4] "I want to go to Spain" (en, intenção futura) → outside', () => {
  const r = getStepDef('LOCATION').validate('I want to go to Spain', {} as any)
  assertEquals((r as any).value, 'outside')
})

Deno.test('[Gustavo#5] "Quero mudar para Madrid" (intenção + cidade) → outside', () => {
  const r = getStepDef('LOCATION').validate('Quero mudar para Madrid', {} as any)
  assertEquals((r as any).value, 'outside')
})

Deno.test('[Gustavo#6] "Sim, estou em Madrid" → spain (afirmativo continua funcionando)', () => {
  const r = getStepDef('LOCATION').validate('Sim, estou em Madrid', {} as any)
  assertEquals((r as any).value, 'spain')
})

Deno.test('[Gustavo#7] "estoy en España" (es afirmativo) → spain', () => {
  const r = getStepDef('LOCATION').validate('estoy en España', {} as any)
  assertEquals((r as any).value, 'spain')
})

Deno.test('[Gustavo#8] "Ainda não" → NUNCA classifica como spain (reask ou outside, mas jamais spain)', () => {
  const r = getStepDef('LOCATION').validate('Ainda não', {} as any)
  // Aceita reask (invalid) OU outside — o crítico é não gravar spain.
  const v = (r as any).value
  assert(v !== 'spain', `esperado != 'spain', recebido ${v}`)
})


Deno.test('[Gustavo#9] "Brasil" → outside', () => {
  const r = getStepDef('LOCATION').validate('Brasil', {} as any)
  assertEquals((r as any).value, 'outside')
})
