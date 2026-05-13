// BPMN v2 (CB_pre-handoff_v2.bpm) alignment tests
// - H1+H2+H3 enviados na MESMA rodada após A/B-completos (3 bolhas; H4 REMOVIDA)
// - Idempotência via flags persistidas (preHandoffSent/handoffSent), não só regex
// - Sufixo localizado de "aguarde um especialista" em todas as 4 línguas
// - Texto literal do diagrama nas 4 línguas
// - Msg5 + Msg6 entregues juntas via ensureServicesAttachedToInterest

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  getPreHandoffSummaryMessage,
  getHandoffTransferMessage,
  getPostHandoffWaitSuffix,
  getServicesOfferedMessage,
  buildPreHandoffPayload,
  preHandoffSummarySent,
  handoffTransferSent,
} from './lib/questions.ts'
import { forceCorrectBlockForLocation, ensureServicesAttachedToInterest } from './lib/overrides.ts'

// ---------- H1|||H2 são duas bolhas; H3 é UMA bolha ----------

Deno.test('BPMN v2 H1|||H2: getPreHandoffSummaryMessage retorna 2 bolhas em PT/ES/EN/FR', () => {
  for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const m = getPreHandoffSummaryMessage(lang)
    const parts = m.split('|||')
    assertEquals(parts.length, 2, `${lang} deve ter 2 bolhas (H1|||H2)`)
    assert(parts[0].trim().length > 0 && parts[1].trim().length > 0, `${lang} bolhas vazias`)
  }
})

Deno.test('BPMN v2 H3: getHandoffTransferMessage retorna 1 bolha (sem H4) em PT/ES/EN/FR', () => {
  for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const m = getHandoffTransferMessage(lang)
    assert(!m.includes('|||'), `${lang} não pode ter mais de 1 bolha (H4 foi removida)`)
    assert(m.trim().length > 0, `${lang} H3 vazia`)
    // H4 foi removida — frases de handoff humano não devem aparecer
    assert(!/encaminhar para um atendente|derivar a un agente|forward you to an agent|transf[ée]rer [àa] un agent/i.test(m),
      `${lang} contém texto de H4 removida`)
  }
})

// ---------- Texto literal do diagrama (PT-BR) ----------

Deno.test('BPMN v2 PT-BR: H1/H2/H3 batem com o texto literal do diagrama', () => {
  const [h1, h2] = getPreHandoffSummaryMessage('pt-BR').split('|||').map(s => s.trim())
  const h3 = getHandoffTransferMessage('pt-BR').trim()
  assertEquals(h1, 'Perfeito. Já consigo ter uma visão inicial do seu caso.')
  assertEquals(h2, 'Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.')
  assertEquals(h3, 'Vou encaminhar suas informações para um especialista analisar com mais profundidade.')
})

// ---------- Payload combinado (BPMN v2 manda H1-H3 numa rodada, 3 bolhas) ----------

Deno.test('BPMN v2 payload: 3 bolhas (H1|||H2|||H3) quando nada enviado', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: false, handoffSent: false })
  const parts = p.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 3, 'BPMN v2 envia H1-H3 na mesma rodada (sem H4)')
})

Deno.test('BPMN v2 idempotência: preHandoffSent=true → só H3 (1 bolha)', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: true, handoffSent: false })
  const parts = p.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 1)
  assertStringIncludes(parts[0], 'encaminhar suas informações')
})

Deno.test('BPMN v2 idempotência: ambas flags true → string vazia (não reenvia)', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: true, handoffSent: true })
  assertEquals(p, '')
})

Deno.test('BPMN v2 idempotência: flags resistem a paráfrase (não dependem só de regex)', () => {
  const p = buildPreHandoffPayload('pt-BR', {
    preHandoffSent: true,
    handoffSent: true,
    transcript: 'paráfrase do agente que NÃO bate com regex literal',
  })
  assertEquals(p, '')
})

Deno.test('BPMN v2 fallback transcript: regex pega H1+H2 enviados', () => {
  const transcript = getPreHandoffSummaryMessage('pt-BR').replace(/\|\|\|/g, '\n')
  assert(preHandoffSummarySent(transcript))
  assert(!handoffTransferSent(transcript))
})

Deno.test('BPMN v2 fallback transcript: regex pega H3 enviado', () => {
  const transcript = getHandoffTransferMessage('pt-BR')
  assert(handoffTransferSent(transcript))
})

// ---------- Sufixo de aguardar especialista (multi-idioma) ----------

Deno.test('Sufixo pós-handoff: presente e curto em PT/ES/EN/FR', () => {
  const sufixos = {
    'pt-BR': /em breve um de nossos especialistas/i,
    'es': /en breve uno de nuestros especialistas/i,
    'en': /one of our specialists/i,
    'fr': /un de nos sp[ée]cialistes/i,
  } as const
  for (const [lang, re] of Object.entries(sufixos)) {
    const s = getPostHandoffWaitSuffix(lang as any)
    assert(re.test(s), `${lang} sufixo não bate: "${s}"`)
    assert(s.length < 200, `${lang} sufixo muito longo`)
  }
})

// ---------- Override de bloco usa flags persistidas ----------

Deno.test('forceCorrectBlockForLocation: B-completo + flags vazias → emite H1-H3 (3 bolhas)', () => {
  const result = forceCorrectBlockForLocation('Qual sua idade?', 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: '2024-02-15',
    empadronadoConfirmed: true,
    empadronadoCity: 'Madrid',
    assistantTranscript: '',
    preHandoffSent: false,
    handoffSent: false,
  })
  const parts = result.replace(/\u200B\[LOCKED\]\u200B/g, '').split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 3, 'B-completo → H1|||H2|||H3 (sem H4)')
})

Deno.test('forceCorrectBlockForLocation: B-completo + ambas flags true → não sobrescreve resposta', () => {
  const original = 'Qual sua idade?'
  const result = forceCorrectBlockForLocation(original, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: '2024-02-15',
    empadronadoConfirmed: true,
    empadronadoCity: 'Madrid',
    assistantTranscript: '',
    preHandoffSent: true,
    handoffSent: true,
  })
  assertEquals(result, original)
})

// ---------- BPMN v2: Msg5 + Msg6 na mesma rodada ----------

Deno.test('BPMN v2 Msg5+Msg6: ensureServicesAttachedToInterest anexa Msg6 quando IA emite só Msg5', () => {
  const ai = 'Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico.'
  const result = ensureServicesAttachedToInterest(ai, 'pt-BR', '')
  const parts = result.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 2, 'Msg5 e Msg6 devem ir como 2 bolhas na mesma rodada')
  assertStringIncludes(parts[1], 'arraigo')
  assertStringIncludes(parts[1], 'reagrupa')
})

Deno.test('BPMN v2 Msg5+Msg6: idempotente — não duplica se Msg6 já no transcript', () => {
  const ai = 'Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico.'
  const transcript = getServicesOfferedMessage('pt-BR')
  const result = ensureServicesAttachedToInterest(ai, 'pt-BR', transcript)
  assertEquals(result, ai, 'não deve anexar Msg6 quando já enviada antes')
})

Deno.test('BPMN v2 Msg5+Msg6: no-op quando IA não está perguntando interesse', () => {
  const ai = 'Você está hoje na Espanha?'
  const result = ensureServicesAttachedToInterest(ai, 'pt-BR', '')
  assertEquals(result, ai)
})
