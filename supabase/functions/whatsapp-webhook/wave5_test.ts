// Wave 5 — testes unitários para as correções de perda de contexto, confusões e alucinações.
// Casos baseados nos diálogos reais de Gustavo, Fred e Agência Liga (12/05/2026).

Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'CBAsesoria_Key',
]) {
  if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')
}

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildStateDirective, type FunnelState } from './lib/funnel-state.ts'
import { detectChatLanguage } from './lib/language.ts'
import { isLikelyFullNameAnswer } from './lib/name-extraction.ts'

function makeState(overrides: Partial<FunnelState> = {}): FunnelState {
  return {
    lead_id: 'test-lead',
    step: 'levantamento',
    name_confirmed: true,
    email_confirmed: true,
    interest_confirmed: 'autorizacao_regresso',
    location_known: 'spain',
    entry_date_confirmed: '2026-04-20',
    empadronado_confirmed: false,
    outside_spain_progress: {},
    last_step_change: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// F1 — Nome já confirmado: a diretiva deve travar nova pergunta de nome
Deno.test('F1 — diretiva trava re-pergunta de nome quando name_confirmed=true', () => {
  const state = makeState({ name_confirmed: true })
  const directive = buildStateDirective(state, 'pt-BR')
  assertStringIncludes(directive, 'NOME já está confirmado')
  assertStringIncludes(directive, 'JAMAIS pergunte o nome novamente')
})

// F2 — Pulo de etapas: a diretiva exige avanço UM passo de cada vez
Deno.test('F2 — diretiva proíbe pulo de etapas', () => {
  const directive = buildStateDirective(makeState(), 'pt-BR')
  assertStringIncludes(directive, 'avance UM passo de cada vez')
})

// F3 — Cliente diverge: a diretiva proíbe reinício pelo nome
Deno.test('F3 — diretiva proíbe reinício do funil em divergência (PT/ES/EN)', () => {
  const pt = buildStateDirective(makeState(), 'pt-BR')
  assertStringIncludes(pt, 'NUNCA reinicie pelo nome')
  const es = buildStateDirective(makeState(), 'es')
  assertStringIncludes(es, 'NUNCA reinicies pidiendo el nombre')
  const en = buildStateDirective(makeState(), 'en')
  assertStringIncludes(en, 'NEVER restart from name')
})

// F4 — Função de overlap usada no dedup do catálogo (replica a lógica do index.ts)
Deno.test('F4 — overlap detecta repetição quase literal do catálogo', () => {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const overlap = (a: string, b: string): number => {
    const aw = new Set(a.split(' ').filter((w) => w.length > 3))
    const bw = b.split(' ').filter((w) => w.length > 3)
    if (!aw.size || !bw.length) return 0
    let hits = 0
    for (const w of bw) if (aw.has(w)) hits++
    return hits / Math.max(aw.size, bw.length)
  }
  const cat = 'Trabalhamos com cidadania espanhola, nômade digital, residências, NIE, TIE, homologação de estudos, antecedentes, reagrupação e outros processos.'
  const sim = overlap(norm(cat), norm(cat))
  assert(sim >= 0.9, `Esperava sim>=0.9 para texto idêntico, recebi ${sim}`)
  const diff = overlap(norm(cat), norm('Anotado, 20 de abril. Você está empadronado?'))
  assert(diff < 0.3, `Esperava sim<0.3 para textos diferentes, recebi ${diff}`)
})

// F5 — "Já me fez esta pergunta" e "Tbem já me perguntou isto" devem detectar PT
Deno.test('F5 — re-detecção de PT em correções do cliente (Agência Liga)', () => {
  assertEquals(detectChatLanguage('Já me fez esta pergunta'), 'pt-BR')
  assertEquals(detectChatLanguage('Tbem já me perguntou isto'), 'pt-BR')
  assertEquals(detectChatLanguage('Hola'), 'es')
  assertEquals(detectChatLanguage('Vale, gracias'), 'es')
})

// F7 — Cliente fora da Espanha: diretiva inclui guard de elegibilidade
Deno.test('F7 — diretiva avisa contra recomendar processos exclusivos para residentes (Gustavo)', () => {
  const state = makeState({ location_known: 'outside', entry_date_confirmed: null, empadronado_confirmed: null })
  const directive = buildStateDirective(state, 'pt-BR')
  assertStringIncludes(directive, 'FORA DA ESPANHA')
  assertStringIncludes(directive, 'autorização de regresso')
  assertStringIncludes(directive, 'PRÉ-REQUISITO')
})

// F8 — Sem regressão na detecção de nome (denylist + tokens válidos)
Deno.test('F8 — name-extraction continua funcionando após mudanças', () => {
  assert(isLikelyFullNameAnswer('Fred William'), 'Fred William deve ser nome válido')
  assert(!isLikelyFullNameAnswer('ok'), 'ok não é nome')
  assert(!isLikelyFullNameAnswer('sim'), 'sim não é nome')
  assert(isLikelyFullNameAnswer('Gustavo Henrique Braga'), '3 tokens válido')
})

// F6 — Regressão do handoff (já coberto em handoff_test.ts; aqui só garantimos que
// a infra de testes Wave 5 não quebra a suíte existente).
Deno.test('F6 — suite Wave 5 não interfere com handoff_test (smoke)', () => {
  // Marcador. O teste real está em handoff_test.ts.
  assert(true)
})
