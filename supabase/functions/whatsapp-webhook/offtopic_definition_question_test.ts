// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyOffTopic } from './lib/offtopic.ts'
import { extractInterestFromMessage, isFactualQuestionMessage } from './lib/extract.ts'

const ctx = { collectionGateActive: true }
const Q_EMAIL = 'Qual seu melhor e-mail?'

Deno.test('classifyOffTopic: "O que é TIE?" durante pergunta de email → question (não interesse)', () => {
  const r = classifyOffTopic('O que é TIE?', Q_EMAIL, ctx)
  assertEquals(r?.kind, 'question')
})

Deno.test('classifyOffTopic: variações multi-idioma de pergunta de definição → question', () => {
  assertEquals(classifyOffTopic('¿Qué es el NIE?', Q_EMAIL, ctx)?.kind, 'question')
  assertEquals(classifyOffTopic('What is TIE?', Q_EMAIL, ctx)?.kind, 'question')
  assertEquals(classifyOffTopic("Qu'est-ce que le TIE?", Q_EMAIL, ctx)?.kind, 'question')
  assertEquals(classifyOffTopic('Quanto custa o processo?', Q_EMAIL, ctx)?.kind, 'question')
  assertEquals(classifyOffTopic('Cómo funciona el arraigo?', Q_EMAIL, ctx)?.kind, 'question')
})

Deno.test('classifyOffTopic: respostas curtas de interesse continuam não parqueando', () => {
  assertEquals(classifyOffTopic('Nacionalidade', 'Me conta com calma: o que você busca hoje?', ctx), null)
  assertEquals(classifyOffTopic('Residencia', 'Me conta com calma: o que você busca hoje?', ctx), null)
})

Deno.test('extractInterestFromMessage: bloqueado em perguntas factuais', () => {
  assertEquals(extractInterestFromMessage('O que é TIE?'), null)
  assertEquals(extractInterestFromMessage('¿Qué es el NIE?'), null)
  assertEquals(extractInterestFromMessage('What is residence?'), null)
  // mas continua extraindo de respostas de interesse legítimas
  assertEquals(extractInterestFromMessage('Nacionalidade'), 'NACIONALIDADE_RESIDENCIA')
  assertEquals(extractInterestFromMessage('arraigo social'), 'RESIDENCIA_PARENTE_COMUNITARIO')
})

Deno.test('isFactualQuestionMessage: detecta padrões multi-idioma', () => {
  assertEquals(isFactualQuestionMessage('O que é TIE?'), true)
  assertEquals(isFactualQuestionMessage('Qué es el arraigo'), true)
  assertEquals(isFactualQuestionMessage('What is NIE?'), true)
  assertEquals(isFactualQuestionMessage("Qu'est-ce que le TIE"), true)
  assertEquals(isFactualQuestionMessage('Nacionalidade'), false)
  assertEquals(isFactualQuestionMessage('Residencia'), false)
})
