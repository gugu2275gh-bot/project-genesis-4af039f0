// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { ensureLang, stepHasLang, localizeTurn } from '../_shared/flow-i18n.ts'

const fakeLLM = async (prompt: string) => {
  const text = prompt.split('MENSAGEM:\n')[1] || ''
  return `[ES] ${text}`
}

Deno.test('pt-BR nunca é traduzido', async () => {
  assertEquals(await ensureLang('Olá!', 'pt-BR', fakeLLM), 'Olá!')
})

Deno.test('idioma diferente é traduzido', async () => {
  assertEquals(await ensureLang('Olá!', 'es', fakeLLM), '[ES] Olá!')
})

Deno.test('sem LLM mantém o texto original', async () => {
  assertEquals(await ensureLang('Olá!', 'es', null), 'Olá!')
})

Deno.test('stepHasLang detecta lacuna de tradução', () => {
  const full = { messages: { 'pt-BR': ['Oi'], es: ['Hola'] }, reask_messages: {} }
  const gap = { messages: { 'pt-BR': ['Oi'] }, reask_messages: {} }
  assert(stepHasLang(full as any, 'es'))
  assert(!stepHasLang(gap as any, 'es'))
  assert(stepHasLang(gap as any, 'pt-BR'))
})

Deno.test('localizeTurn traduz apenas etapas sem tradução gravada', async () => {
  const steps = [
    { id: '1', step_code: 'a', messages: { 'pt-BR': ['Oi'] }, reask_messages: {} },
    { id: '2', step_code: 'b', messages: { 'pt-BR': ['Tudo bem?'], es: ['¿Qué tal?'] }, reask_messages: {} },
  ]
  const turn = {
    outbound: [
      { step_code: 'a', text: 'Oi' },
      { step_code: 'b', text: '¿Qué tal?' },
    ],
    messages: ['Oi', '¿Qué tal?'],
    state: {},
  }
  const out = await localizeTurn(turn as any, 'es', { steps: steps as any, callLLM: fakeLLM })
  assertEquals(out.outbound[0].text, '[ES] Oi')
  assertEquals(out.outbound[1].text, '¿Qué tal?')
  assertEquals(out.messages, ['[ES] Oi', '¿Qué tal?'])
})

Deno.test('localizeTurn não altera turnos em português', async () => {
  const turn = { outbound: [{ step_code: 'a', text: 'Oi' }], messages: ['Oi'], state: {} }
  const out = await localizeTurn(turn as any, 'pt-BR', { callLLM: fakeLLM })
  assertEquals(out.outbound[0].text, 'Oi')
})
