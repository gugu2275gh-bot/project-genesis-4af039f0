import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { detectFlowLanguageOrNull, resolveFlowLanguage } from '../_shared/language-detect.ts'

Deno.test('detecta idioma da primeira resposta', () => {
  assertEquals(detectFlowLanguageOrNull('Hola, me llamo Maria'), 'es')
  assertEquals(detectFlowLanguageOrNull('Olá, meu nome é Maria'), 'pt-BR')
  assertEquals(detectFlowLanguageOrNull('Hello, my name is Mary'), 'en')
  assertEquals(detectFlowLanguageOrNull('Bonjour, je m\'appelle Marie'), 'fr')
})

Deno.test('detecção inconclusiva retorna null', () => {
  assertEquals(detectFlowLanguageOrNull('123456'), null)
  assertEquals(detectFlowLanguageOrNull(''), null)
})

Deno.test('resolveFlowLanguage: trava no idioma detectado', () => {
  const r = resolveFlowLanguage(undefined, 'Hola, necesito ayuda', 'pt-BR')
  assertEquals(r.lang, 'es')
  assertEquals(r.locked, true)
})

Deno.test('resolveFlowLanguage: mantém idioma já travado sem re-detectar', () => {
  const r = resolveFlowLanguage('es', 'Hello there', 'pt-BR')
  assertEquals(r.lang, 'es')
  assertEquals(r.locked, true)
})

Deno.test('resolveFlowLanguage: cai no padrão quando inconclusivo', () => {
  const r = resolveFlowLanguage(undefined, '123', 'fr')
  assertEquals(r.lang, 'fr')
  assertEquals(r.locked, false)
})

Deno.test('resolveFlowLanguage: padrão inválido vira pt-BR', () => {
  const r = resolveFlowLanguage(undefined, '???', 'zz')
  assertEquals(r.lang, 'pt-BR')
  assertEquals(r.locked, false)
})
