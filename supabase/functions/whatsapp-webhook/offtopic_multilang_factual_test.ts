// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyOffTopic, isFactualQuestion } from './lib/offtopic.ts'
import { extractInterestFromMessage } from './lib/extract.ts'

const ctx = { collectionGateActive: true }
const Q_INTEREST_ES = '¿En qué puedo ayudarte? ¿Tu caso encaja en alguno de estos servicios?'

const FACTUAL = [
  // PT
  'O que é TIE?', 'O que seria arraigo?', 'Quanto custa?', 'Como funciona o NIE?',
  'O que significa empadronamiento?', 'O que quer dizer arraigo?',
  // ES (caso do Roberto incluso)
  '¿Qué es el NIE?', 'Que es tie?', 'Que és tie?', 'Qué és TIE?',
  'Cuánto cuesta?', 'Cómo funciona el arraigo?', 'Qué significa TIE?',
  // EN
  'What is TIE?', "What's NIE?", 'What are the requirements?',
  'How does arraigo work?', 'How much does it cost?', 'What does TIE mean?',
  // FR
  "Qu'est-ce que le TIE?", "C'est quoi le NIE?", 'Combien ça coûte?',
  'Comment fonctionne l\'arraigo?', 'Que veut dire TIE?',
  // Fallback curto + ?
  'TIE?', 'Arraigo?', 'Residencia?',
]

const VALID_INTEREST = ['Residencia', 'Nacionalidade', 'Quiero residencia', 'Arraigo familiar']

Deno.test('isFactualQuestion detecta perguntas factuais nas 4 línguas', () => {
  for (const msg of FACTUAL) {
    assertEquals(isFactualQuestion(msg), true, `Deveria detectar factual: "${msg}"`)
  }
})

Deno.test('classifyOffTopic parqueia perguntas factuais mesmo com keyword de serviço', () => {
  for (const msg of FACTUAL) {
    const r = classifyOffTopic(msg, Q_INTEREST_ES, ctx)
    assertEquals(r?.kind, 'question', `Deveria parquear: "${msg}"`)
  }
})

Deno.test('extractInterestFromMessage retorna null em perguntas factuais', () => {
  for (const msg of FACTUAL) {
    assertEquals(extractInterestFromMessage(msg), null, `Não deveria capturar interesse: "${msg}"`)
  }
})

Deno.test('respostas válidas de interesse continuam funcionando', () => {
  for (const msg of VALID_INTEREST) {
    assertEquals(isFactualQuestion(msg), false, `Não deveria ser factual: "${msg}"`)
    // E extractInterestFromMessage deve continuar retornando um valor (não-null)
    const interest = extractInterestFromMessage(msg)
    if (!interest) throw new Error(`Deveria capturar interesse: "${msg}"`)
  }
})
