// Garante que mensagens curtas, saudações e afirmações coloquiais (incluindo
// alongamentos como "siim" e variações como "pode") NUNCA são parqueadas no
// replay buffer durante o cadastro — e replica a lógica de purga do index.ts
// para validar que itens residuais são removidos antes do drain.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyOffTopic } from './lib/offtopic.ts'

const abertura = { collectionGateActive: true, currentStep: 'abertura' as const }
const nome = { collectionGateActive: true, currentStep: 'nome' as const }
const lastQ = 'Vou te fazer algumas perguntas rápidas só para entender seu caso, pode ser?'

// ----- 1) classifyOffTopic: afirmações à abertura NÃO parqueadas ------------

Deno.test('abertura: "pode" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('pode', lastQ, abertura), null)
})

Deno.test('abertura: "pode ser" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('pode ser', lastQ, abertura), null)
})

Deno.test('abertura: "siim" (alongamento) NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('siim', lastQ, abertura), null)
})

Deno.test('abertura: "naao" (alongamento) NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('naao', lastQ, abertura), null)
})

Deno.test('abertura: "okkk" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('okkk', lastQ, abertura), null)
})

Deno.test('abertura: "dale" (ES) NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('dale', lastQ, abertura), null)
})

Deno.test('abertura: "manda" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('manda', lastQ, abertura), null)
})

Deno.test('abertura: "go ahead" (EN) NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('go ahead', lastQ, abertura), null)
})

// ----- 2) Saudação na primeira mensagem (sem pergunta corrente) -------------

Deno.test('primeiro turno: "oi" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('oi', null, { collectionGateActive: true }), null)
})

Deno.test('primeiro turno: "olá" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('olá', null, { collectionGateActive: true }), null)
})

Deno.test('primeiro turno: "hola" NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('hola', null, { collectionGateActive: true }), null)
})

// ----- 3) Pergunta factual real ainda é parqueada (regressão) --------------

Deno.test('abertura: pergunta factual real É parqueada', () => {
  const r = classifyOffTopic('o que é TIE?', lastQ, abertura)
  assertEquals(r?.kind, 'question')
})

// ----- 4) Purga determinística (replica isCadastroData do index.ts) --------

const collapseRepeats = (s: string) =>
  String(s || '').replace(/([a-zA-ZáàâãéêíóôõúüñçÁÀÂÃÉÊÍÓÔÕÚÜÑÇ])\1{1,}/g, '$1')
const GREETING_RE =
  /^\s*(oi+|ol[áa]+|hi+|hel+o+|hey+|hola+|buen[oa]s\s*(d[ií]as|tardes|noches)?|bom\s*dia|boa\s*(tarde|noite)|bonjour|salut|good\s*(morning|afternoon|evening))\s*[.!?]*\s*$/i
const AFFIRM_RE =
  /^\s*(sim|s[íi]|yes|y|claro|correto|exato|exactly|sure|ok|okay|vale|positivo|negativo|n[ãa]o|no|nope|nunca|never|jamais|pode|pode\s+ser|podes|puede|puedes|dale|manda|vai|vamos|fala|pronto|go\s+ahead|adelante|allez(?:-?y)?)\s*[.!?]?\s*$/i

function isPurged(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return true
  if (s.length <= 4) return true
  const norm = collapseRepeats(s)
  if (GREETING_RE.test(s) || GREETING_RE.test(norm)) return true
  if (AFFIRM_RE.test(s) || AFFIRM_RE.test(norm)) return true
  return false
}

Deno.test('purga: saudações são removidas', () => {
  for (const g of ['oi', 'oii', 'olá', 'ola', 'hola', 'hi', 'hello', 'bom dia', 'boa tarde', 'bonjour']) {
    assertEquals(isPurged(g), true, `esperava purgar "${g}"`)
  }
})

Deno.test('purga: afirmações coloquiais são removidas', () => {
  for (const a of ['sim', 'siim', 'pode', 'pode ser', 'ok', 'okkk', 'dale', 'vamos', 'claro', 'manda']) {
    assertEquals(isPurged(a), true, `esperava purgar "${a}"`)
  }
})

Deno.test('purga: dúvida real NÃO é removida', () => {
  for (const q of [
    'como funciona o NIE?',
    'quanto custa o processo?',
    'preciso de ajuda com arraigo',
    'o que é TIE?',
  ]) {
    assertEquals(isPurged(q), false, `não devia purgar "${q}"`)
  }
})

Deno.test('purga: pergunta de nome do bot (vazada) é removida por ser <=4 chars não, por greeting sim', () => {
  // Caso real: a mensagem "oi" do cliente foi parqueada antes da correção.
  assertEquals(isPurged('oi'), true)
  assertEquals(isPurged('olá'), true)
})
