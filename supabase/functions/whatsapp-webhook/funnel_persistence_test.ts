// Wave 6 — regressões: divergência do cliente NÃO pode reabrir etapas confirmadas.
Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY', 'OPENAI_API_KEY',
]) {
  if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')
}

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { lockConfirmedFieldsInResponse } from './lib/overrides.ts'

const flagsAll = { nameKnown: true, emailKnown: true, interestKnown: true, locationKnown: false }

Deno.test('lockConfirmedFieldsInResponse: troca pergunta de nome por localização quando nome+email+interesse já confirmados', () => {
  const ai = 'Ótima pergunta, já te explico em seguida!\nAntes de tudo, como é seu nome completo?'
  const out = lockConfirmedFieldsInResponse(ai, 'pt-BR', flagsAll)
  assert(!/nome completo/i.test(out), `não deveria perguntar nome novamente: ${out}`)
  assertStringIncludes(out, 'Espanha')
  assertStringIncludes(out, 'Ótima pergunta')
})

Deno.test('lockConfirmedFieldsInResponse: troca pergunta de e-mail por interesse quando e-mail confirmado e interesse pendente', () => {
  const ai = 'Obrigado!\nQual é o melhor email para enviarmos as orientações?'
  const out = lockConfirmedFieldsInResponse(ai, 'pt-BR', { nameKnown: true, emailKnown: true, interestKnown: false, locationKnown: false })
  assert(!/email/i.test(out) || /interesse|busca|nacionalidade/i.test(out), `deveria avançar para interesse: ${out}`)
  assertStringIncludes(out, 'busca')
})

Deno.test('lockConfirmedFieldsInResponse: pass-through quando pergunta atual é da etapa pendente correta', () => {
  const ai = 'Hoje você já está na Espanha ou ainda está em outro país?'
  const out = lockConfirmedFieldsInResponse(ai, 'pt-BR', flagsAll)
  assertEquals(out, ai)
})

Deno.test('lockConfirmedFieldsInResponse: caso real Gustavo — divergência seguida de pergunta de nome NÃO repete', () => {
  // Cliente: "Autorizacao de regresso" (resposta válida ao interesse)
  // IA tentou: "Ótima pergunta, já te explico em seguida! Antes de tudo, como é seu nome completo?"
  // Após trava: deve substituir pela próxima etapa pendente (localização) já que nome/email/interesse confirmados
  const ai = 'Ótima pergunta, já te explico em seguida! Antes de tudo, como é seu nome completo?'
  const out = lockConfirmedFieldsInResponse(ai, 'pt-BR', flagsAll)
  assert(!/nome completo/i.test(out), 'nome NÃO pode ser re-perguntado')
})

Deno.test('lockConfirmedFieldsInResponse: idioma espanhol — substitui mantendo idioma', () => {
  const ai = 'Una pregunta rápida.\n¿Cuál es tu nombre completo?'
  const out = lockConfirmedFieldsInResponse(ai, 'es', { nameKnown: true, emailKnown: false, interestKnown: false, locationKnown: false })
  assertStringIncludes(out, 'email') // getEmailQuestion ES contém "email"
})
