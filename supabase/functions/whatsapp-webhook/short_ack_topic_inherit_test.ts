// Garante que mensagens curtas de confirmação ("Ok", "Sim", "Claro"…) sejam
// classificadas como "short ack" e não disparem reclassificação de tópico.
// Esta é a regressão do caso Pedro Henrique: após "Ok" em uma conversa sobre
// ARRAIGO SOCIAL, o agente respondeu sobre RESIDÊNCIA NÃO LUCRATIVA.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SHORT_ACK_RE = /^\s*(ok+|okay|okey|vale|d[ae]le|claro|entendi|entendido|perfeito|perfecto|sim|si|sí|yes|s[ií]m|n[ãa]o|no|tudo bem|todo bien|listo|combinado|👍|✅|✔️|🙏|👌)[\s!?.…]*$/i

function isShortAck(raw: string): boolean {
  const t = (raw || '').trim()
  return t.length > 0 && t.length <= 25 && SHORT_ACK_RE.test(t)
}

Deno.test('short-ack: confirmações em PT/ES/EN são detectadas', () => {
  for (const msg of ['Ok', 'ok', 'okk', 'okay', 'vale', 'dale', 'Claro', 'Entendi', 'Entendido', 'Perfeito', 'Perfecto', 'Sim', 'Si', 'Sí', 'yes', 'Não', 'No', 'tudo bem', 'todo bien', 'listo', 'combinado', '👍', '✅', '👌']) {
    assertEquals(isShortAck(msg), true, `esperado short-ack para "${msg}"`)
  }
})

Deno.test('short-ack: mensagens com conteúdo NÃO são acks', () => {
  for (const msg of ['Ok, mas quanto custa?', 'sim, quero arraigo social', 'não tenho NIE ainda', 'tudo bem, mas preciso de mais info', 'Quero saber sobre nacionalidade']) {
    assertEquals(isShortAck(msg), false, `não deveria ser short-ack: "${msg}"`)
  }
})

Deno.test('short-ack: mensagens vazias / muito longas NÃO são acks', () => {
  assertEquals(isShortAck(''), false)
  assertEquals(isShortAck('   '), false)
  assertEquals(isShortAck('ok '.repeat(20)), false)
})
