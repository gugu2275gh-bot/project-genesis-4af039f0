// BPMN-3 (CB_pre-handoff-3.bpm) alignment tests
// - H1-H4 enviados na MESMA rodada após A/B-completos
// - Idempotência via flags persistidas (preHandoffSent/handoffSent), não só regex
// - Sufixo localizado de "aguarde um especialista" em todas as 4 línguas
// - Texto literal do diagrama nas 4 línguas

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  getPreHandoffSummaryMessage,
  getHandoffTransferMessage,
  getPostHandoffWaitSuffix,
  buildPreHandoffPayload,
  preHandoffSummarySent,
  handoffTransferSent,
} from './lib/questions.ts'
import { forceCorrectBlockForLocation } from './lib/overrides.ts'

// ---------- H1|||H2 / H3|||H4 são duas bolhas cada ----------

Deno.test('BPMN-3 H1|||H2: getPreHandoffSummaryMessage retorna 2 bolhas em PT/ES/EN/FR', () => {
  for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const m = getPreHandoffSummaryMessage(lang)
    const parts = m.split('|||')
    assertEquals(parts.length, 2, `${lang} deve ter 2 bolhas (H1|||H2)`)
    assert(parts[0].trim().length > 0 && parts[1].trim().length > 0, `${lang} bolhas vazias`)
  }
})

Deno.test('BPMN-3 H3|||H4: getHandoffTransferMessage retorna 2 bolhas em PT/ES/EN/FR', () => {
  for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const m = getHandoffTransferMessage(lang)
    const parts = m.split('|||')
    assertEquals(parts.length, 2, `${lang} deve ter 2 bolhas (H3|||H4)`)
  }
})

// ---------- Texto literal do diagrama (PT-BR) ----------

Deno.test('BPMN-3 PT-BR: H1/H2/H3/H4 batem com o texto literal do diagrama', () => {
  const [h1, h2] = getPreHandoffSummaryMessage('pt-BR').split('|||').map(s => s.trim())
  const [h3, h4] = getHandoffTransferMessage('pt-BR').split('|||').map(s => s.trim())
  assertEquals(h1, 'Perfeito. Já consigo ter uma visão inicial do seu caso.')
  assertEquals(h2, 'Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.')
  assertEquals(h3, 'Vou encaminhar suas informações para um especialista analisar com mais profundidade.')
  assertEquals(h4, 'Estou à disposição para ajudar se precisa! Vou te encaminhar para um atendente.')
})

// ---------- Payload combinado (BPMN-3 manda H1-H4 numa rodada) ----------

Deno.test('BPMN-3 payload: 4 bolhas (H1|||H2|||H3|||H4) quando nada enviado', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: false, handoffSent: false })
  const parts = p.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 4, 'BPMN-3 envia H1-H4 na mesma rodada')
})

Deno.test('BPMN-3 idempotência por flag persistida: preHandoffSent=true → só H3|||H4', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: true, handoffSent: false })
  const parts = p.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 2)
  assertStringIncludes(parts[0], 'encaminhar suas informações')
})

Deno.test('BPMN-3 idempotência: ambas flags true → string vazia (não reenvia)', () => {
  const p = buildPreHandoffPayload('pt-BR', { preHandoffSent: true, handoffSent: true })
  assertEquals(p, '')
})

Deno.test('BPMN-3 idempotência: flags resistem a paráfrase (não dependem só de regex)', () => {
  // Mesmo com transcript "limpo" (paráfrase), as flags persistidas bloqueiam o reenvio.
  const p = buildPreHandoffPayload('pt-BR', {
    preHandoffSent: true,
    handoffSent: true,
    transcript: 'paráfrase do agente que NÃO bate com regex literal',
  })
  assertEquals(p, '')
})

Deno.test('BPMN-3 fallback transcript (legado): regex pega H1+H2 enviados', () => {
  const transcript = getPreHandoffSummaryMessage('pt-BR').replace(/\|\|\|/g, '\n')
  assert(preHandoffSummarySent(transcript))
  assert(!handoffTransferSent(transcript))
})

Deno.test('BPMN-3 fallback transcript: regex pega H3+H4 enviados', () => {
  const transcript = getHandoffTransferMessage('pt-BR').replace(/\|\|\|/g, '\n')
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

Deno.test('forceCorrectBlockForLocation: B-completo + flags vazias → emite H1-H4 (4 bolhas)', () => {
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
  assertEquals(parts.length, 4, 'B-completo → H1|||H2|||H3|||H4')
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
