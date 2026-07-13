// @ts-nocheck
Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY','OPENAI_API_KEY',
]) if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decideTurn } from './lib/turn-orchestrator.ts'
import { buildConversationContext } from './lib/conversation-context.ts'

const stateAtName: any = {
  lead_id: 'L1',
  step: 'nome',
  name_confirmed: false, email_confirmed: false,
  interest_confirmed: null, location_known: null,
  entry_date_confirmed: null, empadronado_confirmed: null,
  outside_spain_progress: {}, pending_questions: [],
  last_step_change: '', updated_at: '',
  answers: {},
}
const contact: any = { id: 'C1', full_name: null, email: null, preferred_language: 'pt-BR' }

Deno.test('NAME: nome válido → advance para EMAIL e grava em answers', () => {
  const ctx = buildConversationContext(stateAtName, contact, 'pt-BR')
  const d = decideTurn(ctx, 'João Carlos Silva')
  assertEquals(d.action.kind, 'advance')
  assertEquals(d.next_step, 'EMAIL')
  assertEquals(d.state_patch.name_confirmed, true)
  assert(d.state_patch.answers && (d.state_patch.answers as any).NAME)
})

Deno.test('NAME: pergunta paralela ("O que é TIE?") → park_offtopic, NÃO perde etapa', () => {
  const ctx = buildConversationContext(stateAtName, contact, 'pt-BR')
  const d = decideTurn(ctx, 'O que é TIE?')
  assertEquals(d.action.kind, 'park_offtopic')
  assertEquals(d.current_step, 'NAME')
  assertEquals(d.next_step, 'NAME') // permanece
  assert((d.state_patch.pending_questions as any[]).length === 1)
})

Deno.test('NAME: resposta inválida (1 palavra) → reask, não avança', () => {
  const ctx = buildConversationContext(stateAtName, contact, 'pt-BR')
  const d = decideTurn(ctx, 'João')
  assertEquals(d.action.kind, 'reask_current')
  assertEquals(d.next_step, 'NAME')
})

Deno.test('EMAIL: email válido → advance para INTEREST', () => {
  const s = { ...stateAtName, step: 'email', name_confirmed: true }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'joao@email.com')
  assertEquals(d.action.kind, 'advance')
  assertEquals(d.next_step, 'INTEREST')
  assertEquals(d.state_patch.email_confirmed, true)
})

Deno.test('LOCATION: "estou en España" → INSIDE_ENTRY_DATE com branch=INSIDE', () => {
  const s = { ...stateAtName, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X' }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Estou em España')
  assertEquals(d.action.kind, 'advance')
  assertEquals(d.next_step, 'INSIDE_ENTRY_DATE')
  assertEquals((d.state_patch as any).branch, 'INSIDE')
  assertEquals(d.state_patch.location_known, 'spain')
})

Deno.test('LOCATION: "Brasil" → OUTSIDE_AGE com branch=OUTSIDE', () => {
  const s = { ...stateAtName, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X' }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Estou no Brasil ainda')
  assertEquals(d.action.kind, 'advance')
  assertEquals(d.next_step, 'OUTSIDE_AGE')
  assertEquals((d.state_patch as any).branch, 'OUTSIDE')
})

Deno.test('PRE_HANDOFF/INSIDE_ENTRY_DATE: pass_through (delegado a handler legado)', () => {
  const s = { ...stateAtName, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X', location_known: 'spain' }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'qualquer coisa')
  assertEquals(d.action.kind, 'pass_through')
  assertEquals(d.current_step, 'INSIDE_ENTRY_DATE')
})

Deno.test('EMAIL: cliente repete o nome → reask (não parqueia, não avança)', () => {
  const s = { ...stateAtName, step: 'email', name_confirmed: true }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'gustavo braga')
  assertEquals(d.action.kind, 'reask_current')
  assertEquals(d.current_step, 'EMAIL')
  assertEquals(d.next_step, 'EMAIL')
  assertEquals((d.state_patch as any).pending_questions, undefined)
  assertEquals(d.state_patch.email_confirmed, undefined)
})

Deno.test('EMAIL: texto curto sem @ ("João Silva") → reask, não parqueia', () => {
  const s = { ...stateAtName, step: 'email', name_confirmed: true }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'João Silva')
  assertEquals(d.action.kind, 'reask_current')
  assertEquals(d.next_step, 'EMAIL')
})

Deno.test('EMAIL: pergunta factual ("o que é NIE?") → parqueia como off-topic', () => {
  const s = { ...stateAtName, step: 'email', name_confirmed: true }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'o que é NIE?')
  assertEquals(d.action.kind, 'park_offtopic')
  assertEquals(d.next_step, 'EMAIL')
})



Deno.test('Determinismo: mesma mensagem + mesmo estado → mesma decisão (idempotente)', () => {
  const ctx1 = buildConversationContext(stateAtName, contact, 'pt-BR')
  const ctx2 = buildConversationContext(stateAtName, contact, 'pt-BR')
  const a = decideTurn(ctx1, 'João Silva Pereira')
  const b = decideTurn(ctx2, 'João Silva Pereira')
  assertEquals(a.next_step, b.next_step)
  assertEquals(a.action.kind, b.action.kind)
})

Deno.test('LLM não decide próxima etapa: next_step é função pura de (state, value)', () => {
  // Garante que decideTurn nunca depende de chamada externa para resolver next_step.
  const s = { ...stateAtName, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X' }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Madrid, España')
  // Sem rede, sem LLM, sem banco — decisão calculada localmente.
  assertEquals(d.next_step, 'INSIDE_ENTRY_DATE')
})

// ============================================================
// GUARD FREE MODE — handoff_sent / step='livre'
// ============================================================
const stateHandoffDone: any = {
  lead_id: 'L1',
  step: 'livre',
  name_confirmed: true, email_confirmed: true,
  interest_confirmed: 'RESIDENCIA_PARENTE_COMUNITARIO',
  location_known: 'spain',
  entry_date_confirmed: '2024-09-10',
  empadronado_confirmed: true, empadronado_city: 'barcelona',
  handoff_sent: true, pre_handoff_sent: true,
  outside_spain_progress: {}, pending_questions: [],
  last_step_change: '', updated_at: '',
  answers: {},
}

Deno.test('FREE_MODE: handoff_sent + pergunta off-topic → free_mode+parked, NÃO reabre etapa', () => {
  const ctx = buildConversationContext(stateHandoffDone, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Que tipo de documento eu preciso?')
  assertEquals(d.action.kind, 'free_mode')
  assertEquals((d.action as any).reason, 'handoff_sent')
  assert((d.action as any).parked)
  assert((d.state_patch.pending_questions as any[]).length === 1)
})

Deno.test('FREE_MODE: handoff_sent + fala solta → free_mode sem park, sem reabrir etapa', () => {
  const ctx = buildConversationContext(stateHandoffDone, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Ok obrigado')
  assertEquals(d.action.kind, 'free_mode')
  assertEquals(d.state_patch.pending_questions, undefined)
})

Deno.test('FREE_MODE: step="livre" sem handoff_sent também trava reabertura', () => {
  const s = { ...stateHandoffDone, handoff_sent: false, pre_handoff_sent: false }
  const ctx = buildConversationContext(s, contact, 'pt-BR')
  const d = decideTurn(ctx, 'Estou irregular, quero solicitar um arraigo')
  assertEquals(d.action.kind, 'free_mode')
  assertEquals((d.action as any).reason, 'step_livre')
})

