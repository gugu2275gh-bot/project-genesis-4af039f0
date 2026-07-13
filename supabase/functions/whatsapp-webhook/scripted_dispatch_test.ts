// Pré-handoff determinístico — dispatcher único de perguntas literais (BPMN v2)
// Garante que durante o gate as perguntas saem dos helpers canônicos sem invenção do LLM.

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  getInsideSpainNextQuestion,
  getNextScriptedQuestion,
  getShortAck,
  getEmpadronadoQuestion,
  getEmpadronamientoSinceQuestion,
  getEmpadronamientoCityQuestion,
  getOutsideSpainAgeQuestion,
} from './lib/questions.ts'
import { getPromptTemplates } from './lib/language.ts'

// ---------- BUG do screenshot: insideIntro NÃO vaza no bloco fora ----------

Deno.test('OUTSIDE A6 (formação): pergunta literal SEM insideIntro (bug do screenshot)', () => {
  const transcript = [
    'Qual sua idade?',
    'Você esteve na Europa nos últimos 6 meses?',
    'Possui familiar europeu ou residente legal na Espanha?',
    'Você trabalha remoto?',
  ].join('\n')
  const out = getNextScriptedQuestion('aprofundamento', 'pt-BR', {
    userInSpain: false,
    userOutsideSpain: true,
    assistantTranscript: transcript,
    locationKnown: 'outside',
  })
  assertStringIncludes(out, 'formação superior')
  assert(!out.includes('Agora preciso entender'), 'NUNCA deve emitir B1 intro no bloco fora')
  assert(!out.includes('como está sua situação aqui'))
})

Deno.test('OUTSIDE A2 (idade): pergunta literal "Qual sua idade?" sem preâmbulo A1', () => {
  const out = getNextScriptedQuestion('aprofundamento', 'pt-BR', {
    userInSpain: false,
    userOutsideSpain: true,
    assistantTranscript: '',
    locationKnown: 'outside',
  })
  assertStringIncludes(out, 'Qual sua idade?')
  assert(!out.includes('fora da Espanha'), 'NUNCA deve emitir A1 preâmbulo no bloco fora')
})

// ---------- Bloco INSIDE (B1-B5) ----------

Deno.test('INSIDE B2 1º turno: emite insideIntro + pergunta de data de entrada', () => {
  const t = getPromptTemplates('pt-BR')
  const out = getInsideSpainNextQuestion('pt-BR', '', {})
  assertStringIncludes(out, t.insideIntro)
  assertStringIncludes(out, 'data exata da sua entrada')
})

Deno.test('INSIDE B2 2º turno (intro já enviado): NÃO repete insideIntro', () => {
  const transcript = 'Perfeito. Agora preciso entender como está sua situação aqui.'
  const out = getInsideSpainNextQuestion('pt-BR', transcript, {})
  assert(!out.includes('Agora preciso entender'))
  assertStringIncludes(out, 'data exata da sua entrada')
})

Deno.test('INSIDE B3: empadronado? — após data de entrada confirmada', () => {
  const out = getInsideSpainNextQuestion('pt-BR', '', { entryDateConfirmed: '2024-05-01' })
  assertEquals(out, getEmpadronadoQuestion('pt-BR'))
})

Deno.test('INSIDE B4: desde quando — após empadronado=true', () => {
  const out = getInsideSpainNextQuestion('pt-BR', '', {
    entryDateConfirmed: '2024-05-01',
    empadronadoConfirmed: true,
  })
  assertEquals(out, getEmpadronamientoSinceQuestion('pt-BR'))
})

Deno.test('INSIDE B5: cidade — após desde quando confirmado', () => {
  const out = getInsideSpainNextQuestion('pt-BR', '', {
    entryDateConfirmed: '2024-05-01',
    empadronadoConfirmed: true,
    empadronadoSinceConfirmed: '2024-06-01',
  })
  assertEquals(out, getEmpadronamientoCityQuestion('pt-BR'))
})

Deno.test('INSIDE bloco completo → pré-handoff (H1|||H2|||H3)', () => {
  const out = getInsideSpainNextQuestion('pt-BR', '', {
    entryDateConfirmed: '2024-05-01',
    empadronadoConfirmed: true,
    empadronadoSinceConfirmed: '2024-06-01',
    empadronadoCity: 'Madrid',
  })
  const parts = out.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 3)
  assertStringIncludes(parts[0], 'visão inicial do seu caso')
})

Deno.test('INSIDE empadronado=false: pula B4/B5 direto para pré-handoff', () => {
  const out = getInsideSpainNextQuestion('pt-BR', '', {
    entryDateConfirmed: '2024-05-01',
    empadronadoConfirmed: false,
  })
  const parts = out.split('|||').map(s => s.trim()).filter(Boolean)
  assertEquals(parts.length, 3)
})

// ---------- Dispatcher genérico — outras etapas ----------

Deno.test('Dispatcher abertura: 2 bolhas (openingLine1|||openingLine2)', () => {
  const out = getNextScriptedQuestion('abertura', 'pt-BR', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '',
  })
  const parts = out.split('|||')
  assertEquals(parts.length, 2)
  assertStringIncludes(parts[0], 'CB Asesoria')
})

Deno.test('Dispatcher nome: t.askName literal', () => {
  const out = getNextScriptedQuestion('nome', 'pt-BR', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '',
  })
  assertEquals(out, getPromptTemplates('pt-BR').askName)
})

Deno.test('Dispatcher email: t.thanksThenAskEmail literal', () => {
  const out = getNextScriptedQuestion('email', 'es', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '',
  })
  assertEquals(out, getPromptTemplates('es').thanksThenAskEmail)
})

Deno.test('Dispatcher interesse 1ª vez: Msg5 + Msg6 (2 bolhas)', () => {
  const out = getNextScriptedQuestion('interesse', 'pt-BR', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '', catalogSent: false,
  })
  const parts = out.split('|||')
  assertEquals(parts.length, 2)
  assertStringIncludes(parts[1], 'arraigo')
})

Deno.test('Dispatcher interesse com catálogo já enviado: só Msg5', () => {
  const out = getNextScriptedQuestion('interesse', 'pt-BR', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '', catalogSent: true,
  })
  assertEquals(out, getPromptTemplates('pt-BR').interestQuestion)
})

Deno.test('Dispatcher localizacao: t.askLocationSpain literal', () => {
  const out = getNextScriptedQuestion('localizacao', 'en', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '',
  })
  assertEquals(out, getPromptTemplates('en').askLocationSpain)
})

Deno.test('Dispatcher aprofundamento sem localização confirmada: string vazia', () => {
  const out = getNextScriptedQuestion('aprofundamento', 'pt-BR', {
    userInSpain: false, userOutsideSpain: false, assistantTranscript: '',
  })
  assertEquals(out, '')
})

// ---------- getShortAck ----------

Deno.test('getShortAck: "Não" PT → sem ack (evita repetição)', () => {
  assertEquals(getShortAck('pt-BR', 'Você trabalha remoto?', 'Não'), '')
})

Deno.test('getShortAck: "Sí" ES → sem ack', () => {
  assertEquals(getShortAck('es', '¿Trabajas de forma remota?', 'Sí'), '')
})

Deno.test('getShortAck: "Yes" EN → sem ack', () => {
  assertEquals(getShortAck('en', 'Do you work remotely?', 'Yes'), '')
})

Deno.test('getShortAck: "Oui" FR → sem ack', () => {
  assertEquals(getShortAck('fr', 'Travaillez-vous à distance ?', 'Oui'), '')
})

Deno.test('getShortAck: idade numérica → sem ack', () => {
  assertEquals(getShortAck('pt-BR', 'Qual sua idade?', '32'), '')
})


Deno.test('getShortAck: após nome completo → "Obrigado."', () => {
  assertEquals(getShortAck('pt-BR', 'Antes de tudo, como é seu nome completo?', 'Roberto Silva'), 'Obrigado.')
})

Deno.test('getShortAck: sem pergunta anterior → vazio', () => {
  assertEquals(getShortAck('pt-BR', '', 'Olá'), '')
})

// ---------- Idiomas: insideIntro localizado em ES ----------

Deno.test('INSIDE B2 1º turno em ES: emite intro localizado', () => {
  const out = getInsideSpainNextQuestion('es', '', {})
  assertStringIncludes(out, 'Ahora necesito entender')
  assertStringIncludes(out, 'fecha exacta de tu entrada')
})

Deno.test('INSIDE B2 1º turno em FR: emite intro localizado', () => {
  const out = getInsideSpainNextQuestion('fr', '', {})
  assertStringIncludes(out, 'Maintenant je dois comprendre')
  assertStringIncludes(out, "date exacte de votre entrée")
})
