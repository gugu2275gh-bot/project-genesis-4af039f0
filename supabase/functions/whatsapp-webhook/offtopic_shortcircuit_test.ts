// Verifica que o short-circuit de off-topic monta resposta determinística
// (ACK + pergunta canônica) SEM usar "Obrigado." nem outras aberturas curtas
// que duplicariam a pergunta canônica.

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getOffTopicAckPhrase } from './lib/offtopic.ts'
import { getPromptTemplates, ChatLanguage } from './lib/language.ts'

const langs: ChatLanguage[] = ['pt-BR', 'es', 'en', 'fr']

Deno.test('ACK de off-topic NUNCA começa com "Obrigado." / "Gracias." / "Thank you." / "Merci."', () => {
  for (const l of langs) {
    const ack = getOffTopicAckPhrase(l)
    assert(!/^obrigado/i.test(ack), `PT leak em ${l}: ${ack}`)
    assert(!/^gracias/i.test(ack), `ES leak em ${l}: ${ack}`)
    assert(!/^thank you/i.test(ack), `EN leak em ${l}: ${ack}`)
    assert(!/^merci/i.test(ack), `FR leak em ${l}: ${ack}`)
  }
})

Deno.test('Composição ACK + askEmail produz 2 bolhas sem duplicar "Obrigado."', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    const ack = getOffTopicAckPhrase(l)
    const composed = `${ack}|||${t.thanksThenAskEmail}`
    const parts = composed.split('|||')
    assert(parts.length === 2, `esperado 2 bolhas em ${l}`)
    // Nenhuma das bolhas começa com a abertura curta da outra
    assert(!/^obrigado\.\s*obrigado/i.test(parts[1]), 'duplicação PT')
    assert(!/^gracias\.\s*gracias/i.test(parts[1]), 'duplicação ES')
  }
})

Deno.test('Composição ACK + askLocationSpain produz 2 bolhas', () => {
  for (const l of langs) {
    const t = getPromptTemplates(l)
    const ack = getOffTopicAckPhrase(l)
    const composed = `${ack}|||${t.askLocationSpain}`
    const parts = composed.split('|||')
    assert(parts.length === 2, `esperado 2 bolhas em ${l}`)
    assert(parts[1].trim() === t.askLocationSpain.trim())
  }
})
