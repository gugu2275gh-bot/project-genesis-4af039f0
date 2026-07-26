import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  detectLockableLanguageOrNull,
  detectExplicitLanguageRequest,
  isAmbiguousLanguageSample,
  resolveFlowLanguage,
} from '../_shared/language-detect.ts'

Deno.test('respostas curtas ambíguas não travam idioma', () => {
  for (const s of ['Sim', 'sim', 'nao', 'não', 'no', 'yes', 'sí', 'oui', 'ok', 'nope']) {
    assertEquals(isAmbiguousLanguageSample(s), true, `esperado ambíguo: ${s}`)
    assertEquals(detectLockableLanguageOrNull(s), null, `não deveria detectar: ${s}`)
  }
})

Deno.test('frases reais continuam sendo detectadas', () => {
  assertEquals(detectLockableLanguageOrNull('Hello, I need help with residency'), 'en')
  assertEquals(detectLockableLanguageOrNull('Hola, necesito ayuda con la residencia'), 'es')
  assertEquals(detectLockableLanguageOrNull('Olá, preciso de ajuda com residência'), 'pt-BR')
  assertEquals(detectLockableLanguageOrNull('Bonjour, je voudrais une aide'), 'fr')
})

Deno.test('idioma travado é mantido mesmo com resposta em outra língua', () => {
  assertEquals(resolveFlowLanguage('en', 'Sim', 'pt-BR').lang, 'en')
  assertEquals(resolveFlowLanguage('en', 'nao', 'pt-BR').lang, 'en')
  assertEquals(resolveFlowLanguage('pt-BR', 'yes', 'pt-BR').lang, 'pt-BR')
  assertEquals(resolveFlowLanguage('es', 'no', 'pt-BR').lang, 'es')
})

Deno.test('pedido explícito de troca é reconhecido', () => {
  assertEquals(detectExplicitLanguageRequest('pode falar em português?'), 'pt-BR')
  assertEquals(detectExplicitLanguageRequest('en español por favor'), 'es')
  assertEquals(detectExplicitLanguageRequest('can you speak english?'), 'en')
  assertEquals(detectExplicitLanguageRequest('parlez en français'), 'fr')
})

Deno.test('mensagem comum não é pedido de troca de idioma', () => {
  assertEquals(detectExplicitLanguageRequest('Sim'), null)
  assertEquals(detectExplicitLanguageRequest('Roberto Barros'), null)
  assertEquals(detectExplicitLanguageRequest('quero estudar na Espanha'), null)
})
