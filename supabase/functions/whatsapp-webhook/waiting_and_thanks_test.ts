// Regressão: após handoff_sent=true, mensagens de agradecimento ("obrigado",
// "gracias", "thanks") e de aguardo ("fico no aguardo", "quedo a la espera",
// "I'll be waiting") NÃO podem reengajar a IA. Este teste replica as regexes
// definidas em index.ts (WAITING_RE, THANKS_ONLY_RE, ACK_RE) — se mudar lá,
// mudar aqui também.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const ACK_RE = /^(ok|okay|okey|k|kk|vale|blz|beleza|certo|claro|perfeito|entendi|entendido|obrigad[oa]|obrigada|obrigado|valeu|gracias|muchas gracias|thanks|thank you|thx|ty|merci|hum+|mmh+|hmm+|aha+|humm+|👍|🙏|👌|✅|😊|🙂)$/i

const THANKS_TOKEN = '(?:muito\\s+|muy\\s+|mui\\s+|mt\\s+|so\\s+|really\\s+|muchas\\s+|muchisimas\\s+|much[íi]simas\\s+|muitas\\s+|mil\\s+)?(?:obrigad(?:[oa]|[ãa]o|ona)|obg|brigad(?:[oa]|[ãa]o)|agradecid[oa]|grat[oa]|valeu|vlw|gracias|graci[ñn]as|grazas|mercies?|merci|danke|thanks?|thx|tks|tysm|ty|thank\\s*(?:you|u))(?:\\s+(?:mesmo|demais|mesmo\\s+assim|de\\s+novo|novamente|otra\\s+vez|de\\s+nuevo|nuevamente|a\\s+lot|so\\s+much|very\\s+much|beaucoup|mil|muito|muitas?|muchas?|mil\\s+vezes))?'
const THANKS_ONLY_RE = new RegExp(`^(?:ok+\\s+|okay\\s+|vale\\s+|blz\\s+|beleza\\s+|perfeito\\s+|perfecto\\s+|listo\\s+)?${THANKS_TOKEN}(?:[,!.\\s]+${THANKS_TOKEN})*[!.\\s👍🙏👌✅✔️😊🙂❤️💚💛]*$`, 'i')

const WAITING_RE = /^(?:ok+[,!.\s]*)?(?:fico|vou ficar|estou|estarei|seguirei|sigo|quedo|me quedo|estoy|estar[ée]|voy a estar|i(?:'|)?ll (?:be )?wait(?:ing)?|waiting|awaiting|je (?:vais )?attend(?:s|re)?)\b[\s\S]{0,60}?(?:aguard\w*|espera\w*|esperando|attente|attend\w*|wait\w*|hearing back|your (?:reply|response))[!.\s👍🙏👌✅✔️😊🙂❤️💚💛]*$/i

const EMOJI_ONLY_RE = /^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)$/u

function normalize(t: string) {
  return t.toLowerCase().replace(/[.!?…\s]+$/g, '').trim()
}

// Reproduz o gate real do webhook (linhas 1216-1224 index.ts).
function shouldPauseAfterHandoff(inboundText: string): boolean {
  const raw = inboundText.trim()
  if (raw.includes('?')) return false
  const normalized = normalize(raw)
  const isEmojiOnly = EMOJI_ONLY_RE.test(raw)
  const isShortAck = (ACK_RE.test(normalized) || isEmojiOnly) && raw.length < 25
  const isThanksOnly = THANKS_ONLY_RE.test(normalized)
  const isWaitingOnly = WAITING_RE.test(raw)
  return isShortAck || isThanksOnly || isWaitingOnly || isEmojiOnly
}

// ---------- Agradecimentos PT/ES/EN/FR ----------
Deno.test('THANKS: pausam IA após handoff (PT/ES/EN/FR + variações)', () => {
  const cases = [
    // PT
    'obrigado', 'obrigada', 'muito obrigado', 'muito obrigada mesmo',
    'obrigado de novo', 'obrigada novamente', 'obrigadão', 'obg', 'obg!',
    'brigado', 'valeu', 'vlw', 'vlw!!', 'agradecido', 'grato', 'muitas obrigado',
    // ES
    'gracias', 'muchas gracias', 'mil gracias', 'muchísimas gracias',
    'gracias de nuevo', 'gracias otra vez', 'muy agradecido',
    // EN
    'thanks', 'thanks!', 'thank you', 'thank you so much', 'thanks a lot',
    'thx', 'ty', 'tysm', 'tks',
    // FR / DE
    'merci', 'merci beaucoup', 'danke',
    // Combinados com prefixo de ack
    'ok obrigado', 'vale gracias', 'perfeito obrigado', 'listo gracias',
    // Com emoji trailing
    'obrigado 🙏', 'gracias 👍', 'thanks ❤️',
  ]
  for (const msg of cases) {
    assertEquals(shouldPauseAfterHandoff(msg), true, `deveria pausar IA: "${msg}"`)
  }
})

// ---------- Aguardo PT/ES/EN/FR ----------
Deno.test('WAITING: pausam IA após handoff (PT/ES/EN/FR)', () => {
  const cases = [
    // PT
    'fico no aguardo', 'fico aguardando', 'vou ficar no aguardo',
    'estou aguardando', 'estarei aguardando', 'sigo aguardando', 'seguirei aguardando',
    'ok, fico no aguardo', 'ok fico aguardando resposta',
    // ES
    'quedo a la espera', 'me quedo a la espera', 'quedo esperando',
    'estoy esperando', 'estaré esperando', 'voy a estar esperando',
    'sigo esperando',
    // EN
    "I'll be waiting", 'Ill be waiting', "I'll wait for your reply",
    'waiting for your response', 'awaiting your reply', 'waiting to hear back',
    // FR
    "j'attends votre réponse", 'je vais attendre votre reponse',
  ]
  for (const msg of cases) {
    assertEquals(shouldPauseAfterHandoff(msg), true, `deveria pausar IA: "${msg}"`)
  }
})

// ---------- Emoji-only e acks curtos ----------
Deno.test('ACK/EMOJI: pausam IA após handoff', () => {
  const cases = ['ok', 'okay', 'vale', 'perfeito', 'entendi', 'claro', '👍', '🙏', '👌 ✅', '😊']
  for (const msg of cases) {
    assertEquals(shouldPauseAfterHandoff(msg), true, `deveria pausar IA: "${msg}"`)
  }
})

// ---------- NÃO pausar: mensagens com conteúdo ou pergunta ----------
Deno.test('NÃO pausam IA — mensagens com conteúdo ou pergunta explícita', () => {
  const cases = [
    // Pergunta explícita (mesmo agradecendo)
    'obrigado, quando posso agendar?',
    'gracias, ¿cuándo me llaman?',
    'thanks, quick question?',
    // Aguardo + pergunta
    'fico no aguardo, mas quanto custa?',
    // Conteúdo além de agradecimento
    'obrigado, mas preciso de mais info',
    'gracias pero tengo una duda',
    'thanks but I need more info',
    // Nova solicitação
    'quero saber sobre nacionalidade',
    'preciso agendar reunião',
    'me llama por favor',
    // Frases neutras não são aguardo
    'estou em Madrid',
    'estoy en España',
    'I am in Barcelona',
  ]
  for (const msg of cases) {
    assertEquals(shouldPauseAfterHandoff(msg), false, `NÃO deveria pausar IA: "${msg}"`)
  }
})

// ---------- Edge cases ----------
Deno.test('Edge cases: vazio / muito longo / misto', () => {
  assertEquals(shouldPauseAfterHandoff(''), false)
  assertEquals(shouldPauseAfterHandoff('   '), false)
  // Ack longo demais deixa de ser "short" mas ainda pode ser thanks-only
  assertEquals(shouldPauseAfterHandoff('obrigado '.repeat(3).trim()), true)
  // Mensagem contendo "?" nunca pausa
  assertEquals(shouldPauseAfterHandoff('obrigado?'), false)
  assertEquals(shouldPauseAfterHandoff('fico no aguardo?'), false)
})
