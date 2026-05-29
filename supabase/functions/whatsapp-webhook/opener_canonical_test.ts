// Verifica que as frases canônicas de abertura existem nos 4 idiomas
// e que ambas (openingLine1 e openingLine2) estão sempre presentes.
// O short-circuit em index.ts depende disso para garantir o mesmo fluxo
// em PT/ES/EN/FR sem precisar do LLM.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getPromptTemplates, ChatLanguage } from './lib/language.ts'

const langs: ChatLanguage[] = ['pt-BR', 'es', 'en', 'fr']

Deno.test('openingLine1 e openingLine2 definidos em todos os idiomas', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    assert(t.openingLine1 && t.openingLine1.length > 10, `openingLine1 vazio em ${l}`)
    assert(t.openingLine2 && t.openingLine2.length > 10, `openingLine2 vazio em ${l}`)
  }
})

Deno.test('openingLine2 sempre termina com pergunta (?)', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    assert(/[?¿]\s*$/.test(t.openingLine2.trim()), `openingLine2 sem '?' em ${l}: ${t.openingLine2}`)
  }
})

Deno.test('Short-circuit produz duas bolhas com delimitador |||', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    const composed = `${t.openingLine1}|||${t.openingLine2}`
    const parts = composed.split('|||')
    assertEquals(parts.length, 2, `esperado 2 bolhas em ${l}`)
    assertEquals(parts[0], t.openingLine1)
    assertEquals(parts[1], t.openingLine2)
  }
})
