import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'

// Replica exata do THANKS_ONLY_RE em index.ts — se mudar lá, mudar aqui.
const THANKS_TOKEN = '(?:muito\\s+|muy\\s+|mui\\s+|mt\\s+|so\\s+|really\\s+)?(?:obrigad[oa]|obg|brigad[oa]|agradecid[oa]|grat[oa]|valeu|vlw|gracias|graci[ñn]as|grazas|mercies?|merci|danke|thanks?|thx|tks|tysm|ty|thank\\s*(?:you|u))(?:\\s+(?:mesmo|demais|mesmo\\s+assim|de\\s+novo|novamente|otra\\s+vez|de\\s+nuevo|nuevamente|a\\s+lot|so\\s+much|very\\s+much|beaucoup|mil|muito|muitas?|muchas?|mil\\s+vezes))?'
const THANKS_ONLY_RE = new RegExp(`^(?:ok+\\s+|okay\\s+|vale\\s+|blz\\s+|beleza\\s+|perfeito\\s+|perfecto\\s+|listo\\s+)?${THANKS_TOKEN}(?:[,!.\\s]+${THANKS_TOKEN})*[!.\\s👍🙏👌✅✔️😊🙂❤️💚💛]*$`, 'i')

function normalize(t: string) {
  return t.toLowerCase().replace(/[.!?…\s]+$/g, '').trim()
}

const POSITIVE = [
  'obrigado', 'obrigada', 'obrigadão', 'muito obrigado', 'muito obrigada',
  'obrigado de novo', 'obrigada novamente', 'muito obrigado mesmo', 'obrigado demais',
  'obg', 'obg!', 'brigado', 'brigada', 'valeu', 'valeu!', 'vlw', 'vlw!!',
  'agradecido', 'agradecida', 'grato', 'grata',
  'gracias', 'gracias!', 'muchas gracias', 'mil gracias', 'muy agradecido',
  'gracias de nuevo', 'gracias otra vez', 'muchas gracias de nuevo',
  'thanks', 'thanks!', 'thank you', 'thank you so much', 'thanks a lot',
  'thx', 'ty', 'tysm', 'tks',
  'merci', 'merci beaucoup', 'danke',
  'ok obrigado', 'vale gracias', 'perfeito obrigado', 'listo gracias',
  'obrigado 🙏', 'gracias 👍', 'thanks ❤️',
]

const NEGATIVE = [
  'obrigado, mas preciso de mais info',
  'gracias, pero tengo una duda',
  'thanks, quick question',
  'obrigado quando posso agendar?',
  'ok',
  'sim',
  'ola',
  'obrigado pelo retorno, mas',
]

Deno.test('THANKS_ONLY_RE: reconhece agradecimentos puros', () => {
  for (const msg of POSITIVE) {
    const n = normalize(msg)
    assertEquals(THANKS_ONLY_RE.test(n), true, `deveria reconhecer: "${msg}" (normalized="${n}")`)
  }
})

Deno.test('THANKS_ONLY_RE: NÃO dispara em mensagens com conteúdo além do agradecimento', () => {
  for (const msg of NEGATIVE) {
    const n = normalize(msg)
    const hasQuestion = msg.includes('?')
    const matched = THANKS_ONLY_RE.test(n) && !hasQuestion
    assertEquals(matched, false, `NÃO deveria pausar IA em: "${msg}"`)
  }
})
