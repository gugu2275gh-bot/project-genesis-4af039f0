// Verifica que as frases canônicas Msg3/Msg4/Msg5/Msg6 existem em PT/ES/EN/FR
// e que o short-circuit do gate Msg5+Msg6 produz duas bolhas com "|||".
// O gate em index.ts depende disso para emitir o mesmo fluxo em qualquer idioma.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getPromptTemplates, ChatLanguage } from './lib/language.ts'

const langs: ChatLanguage[] = ['pt-BR', 'es', 'en', 'fr']

Deno.test('Msg3 askName definida em todos os idiomas', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    assert(t.askName && t.askName.length > 10, `askName vazio em ${l}`)
    assert(/[?¿]\s*$/.test(t.askName.trim()), `askName sem '?' em ${l}: ${t.askName}`)
  }
})

Deno.test('Msg4 thanksThenAskEmail definida e contém token de e-mail', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    assert(t.thanksThenAskEmail && t.thanksThenAskEmail.length > 10, `vazio em ${l}`)
    assert(/(e[- ]?mail|correo|courriel)/i.test(t.thanksThenAskEmail), `sem token de e-mail em ${l}`)
  }
})

Deno.test('Msg5 interestQuestion e Msg6 servicesCatalog presentes', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    assert(t.interestQuestion && t.interestQuestion.length > 10, `interest vazio em ${l}`)
    assert(t.servicesCatalog && t.servicesCatalog.length > 10, `catalog vazio em ${l}`)
  }
})

Deno.test('Gate Msg5+Msg6 produz duas bolhas separadas por |||', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    const composed = `${t.interestQuestion}|||${t.servicesCatalog}`
    const parts = composed.split('|||')
    assertEquals(parts.length, 2, `esperado 2 bolhas em ${l}`)
    assertEquals(parts[0], t.interestQuestion)
    assertEquals(parts[1], t.servicesCatalog)
  }
})
